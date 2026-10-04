// js/app.js - Lógica de Negocio e Interfaz para Zarela Clink

const app = {
  // Estado global
  clientes: [],
  articulos: [],
  ventas: [],
  cobros: [],
  carrito: [], // Ítems temporales para la factura en creación

  // =========================================================================
  // 1. INICIALIZACIÓN Y NAVEGACIÓN DE PESTAÑAS
  // =========================================================================
  init: async function() {
    console.log('Inicializando Sistema Zarela Clink...');
    this.estableserFechaActual();
    await this.cargarClientes();
    await this.cargarArticulos();
    await this.cargarCobranzas();
    this.actualizarKPIs();
  },

  estableserFechaActual: function() {
    const hoy = new Date().toISOString().split('T')[0];
    const elVentaFecha = document.getElementById('venta-fecha');
    const elCobroFecha = document.getElementById('cobro-fecha');
    if (elVentaFecha) elVentaFecha.value = hoy;
    if (elCobroFecha) elCobroFecha.value = hoy;
  },

  navegarTab: function(nombreTab) {
    const tabs = ['clientes', 'articulos', 'ventas', 'cobranza'];
    tabs.forEach(t => {
      const sec = document.getElementById(`tab-${t}`);
      const btn = document.getElementById(`nav-btn-${t}`);
      if (sec) sec.classList.add('d-none');
      if (btn) {
        btn.classList.remove('active-tab', 'btn-primary');
        btn.classList.add('btn-outline');
      }
    });

    const secActiva = document.getElementById(`tab-${nombreTab}`);
    const btnActivo = document.getElementById(`nav-btn-${nombreTab}`);
    if (secActiva) secActiva.classList.remove('d-none');
    if (btnActivo) {
      btnActivo.classList.add('active-tab', 'btn-primary');
      btnActivo.classList.remove('btn-outline');
    }

    if (nombreTab === 'ventas') this.pobladorSelectsVenta();
    if (nombreTab === 'cobranza') this.cargarCobranzas();
  },

  showToast: function(titulo, mensaje, tipo = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-item toast-${tipo}`;
    
    let icono = 'fa-check-circle';
    if (tipo === 'danger') icono = 'fa-exclamation-circle';
    if (tipo === 'warning') icono = 'fa-triangle-exclamation';

    toast.innerHTML = `
      <i class="fa-solid ${icono}" style="font-size: 1.2rem; margin-top: 0.1rem;"></i>
      <div class="toast-content">
        <h4>${titulo}</h4>
        <p>${mensaje}</p>
      </div>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(50px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  },

  actualizarKPIs: function() {
    document.getElementById('kpi-clientes').textContent = this.clientes.length;
    document.getElementById('kpi-articulos').textContent = this.articulos.length;

    let totalFacturado = 0;
    let totalPendiente = 0;

    this.ventas.forEach(v => {
      totalFacturado += parseFloat(v.monto_total || 0);
      const abonado = (v.cobros || []).reduce((acc, c) => acc + parseFloat(c.monto || 0), 0);
      const saldo = parseFloat(v.monto_total || 0) - abonado;
      if (saldo > 0) totalPendiente += saldo;
    });

    document.getElementById('kpi-facturado').textContent = `$${totalFacturado.toFixed(2)}`;
    document.getElementById('kpi-pendiente').textContent = `$${totalPendiente.toFixed(2)}`;
  },

  // =========================================================================
  // 2. MÓDULO DE CLIENTES
  // =========================================================================
  cargarClientes: async function() {
    try {
      const { data, error } = await _supabase.from('clientes').select('*').order('nombre');
      if (error) throw error;

      this.clientes = data || [];
      this.renderTablaClientes(this.clientes);
      this.pobladorSelectsVenta();
    } catch (err) {
      console.error('Error al cargar clientes:', err);
      this.showToast('Error', 'No se pudieron obtener los clientes desde Supabase.', 'danger');
    }
  },

  renderTablaClientes: function(lista) {
    const tbody = document.getElementById('tbody-clientes');
    if (!tbody) return;

    if (lista.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="empty-state">
            <i class="fa-solid fa-users-slash"></i>
            <p>No hay clientes registrados aún.</p>
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = lista.map(c => `
      <tr>
        <td><strong>#${c.id}</strong></td>
        <td><strong>${c.nombre}</strong></td>
        <td><span class="ag-badge badge-info">${c.cedula_rif}</span></td>
        <td>${c.telefono || '-'}</td>
        <td>${c.correo || '-'}</td>
        <td>${c.direccion || '-'}</td>
        <td style="text-align: right;">
          <button class="ag-btn btn-outline btn-sm" onclick="app.filtrarVentasPorCliente(${c.id})" title="Ver facturas">
            <i class="fa-solid fa-file-invoice-dollar"></i>
          </button>
        </td>
      </tr>
    `).join('');
  },

  guardarCliente: async function(e) {
    e.preventDefault();
    const btnSubmit = document.getElementById('btn-submit-cliente');
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<span class="spinner"></span> Guardando...';

    const nuevoCliente = {
      nombre: document.getElementById('cliente-nombre').value.trim(),
      cedula_rif: document.getElementById('cliente-rif').value.trim(),
      telefono: document.getElementById('cliente-telefono').value.trim(),
      correo: document.getElementById('cliente-correo').value.trim(),
      direccion: document.getElementById('cliente-direccion').value.trim()
    };

    try {
      const { error } = await _supabase.from('clientes').insert([nuevoCliente]);
      if (error) throw error;

      this.showToast('Éxito', 'Cliente registrado correctamente.');
      document.getElementById('form-cliente').reset();
      await this.cargarClientes();
      this.actualizarKPIs();
    } catch (err) {
      console.error('Error al guardar cliente:', err);
      this.showToast('Error al guardar', err.message || 'Verifique que la Cédula/RIF no esté repetida.', 'danger');
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Guardar Cliente';
    }
  },

  filtrarClientes: function() {
    const q = document.getElementById('buscar-cliente').value.toLowerCase();
    const filtrados = this.clientes.filter(c => 
      c.nombre.toLowerCase().includes(q) || c.cedula_rif.toLowerCase().includes(q)
    );
    this.renderTablaClientes(filtrados);
  },

  // =========================================================================
  // 3. MÓDULO DE ARTÍCULOS
  // =========================================================================
  cargarArticulos: async function() {
    try {
      const { data, error } = await _supabase.from('articulos').select('*').order('nombre');
      if (error) throw error;

      this.articulos = data || [];
      this.renderTablaArticulos(this.articulos);
      this.pobladorSelectsVenta();
    } catch (err) {
      console.error('Error al cargar artículos:', err);
      this.showToast('Error', 'No se pudieron obtener los artículos.', 'danger');
    }
  },

  renderTablaArticulos: function(lista) {
    const tbody = document.getElementById('tbody-articulos');
    if (!tbody) return;

    if (lista.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="empty-state">
            <i class="fa-solid fa-box-open"></i>
            <p>No hay prendas registradas en el catálogo.</p>
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = lista.map(a => {
      const costo = parseFloat(a.costo || 0);
      const precio = parseFloat(a.precio || 0);
      const margen = costo > 0 ? (((precio - costo) / costo) * 100).toFixed(1) : '100.0';

      return `
        <tr>
          <td><strong>#${a.id}</strong></td>
          <td><strong>${a.nombre}</strong></td>
          <td>$${costo.toFixed(2)}</td>
          <td><strong style="color: var(--primary);">$${precio.toFixed(2)}</strong></td>
          <td><span class="ag-badge badge-success">+${margen}%</span></td>
          <td style="text-align: right;">
            <button class="ag-btn btn-outline btn-sm" onclick="app.seleccionarParaVenta(${a.id})" title="Añadir a Venta">
              <i class="fa-solid fa-plus"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  },

  guardarArticulo: async function(e) {
    e.preventDefault();
    const btnSubmit = document.getElementById('btn-submit-articulo');
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<span class="spinner"></span> Guardando...';

    const nuevoArticulo = {
      nombre: document.getElementById('articulo-nombre').value.trim(),
      costo: parseFloat(document.getElementById('articulo-costo').value),
      precio: parseFloat(document.getElementById('articulo-precio').value)
    };

    try {
      const { error } = await _supabase.from('articulos').insert([nuevoArticulo]);
      if (error) throw error;

      this.showToast('Éxito', 'Artículo guardado correctamente en el catálogo.');
      document.getElementById('form-articulo').reset();
      await this.cargarArticulos();
      this.actualizarKPIs();
    } catch (err) {
      console.error('Error al guardar artículo:', err);
      this.showToast('Error', err.message || 'No se pudo registrar el artículo.', 'danger');
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Guardar Artículo';
    }
  },

  filtrarArticulos: function() {
    const q = document.getElementById('buscar-articulo').value.toLowerCase();
    const filtrados = this.articulos.filter(a => a.nombre.toLowerCase().includes(q));
    this.renderTablaArticulos(filtrados);
  },

  // =========================================================================
  // 4. MÓDULO DE VENTAS / FACTURACIÓN (SOLUCIÓN DEL DETALLE)
  // =========================================================================
  pobladorSelectsVenta: function() {
    const selCliente = document.getElementById('venta-cliente-select');
    const selArticulo = document.getElementById('venta-articulo-select');
    const selFiltroCobranza = document.getElementById('filtro-cobranza-cliente');

    if (selCliente) {
      selCliente.innerHTML = '<option value="">-- Seleccione un cliente --</option>' +
        this.clientes.map(c => `<option value="${c.id}">${c.nombre} (${c.cedula_rif})</option>`).join('');
    }

    if (selFiltroCobranza) {
      selFiltroCobranza.innerHTML = '<option value="TODOS">-- Todos los Clientes --</option>' +
        this.clientes.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
    }

    if (selArticulo) {
      selArticulo.innerHTML = '<option value="">-- Seleccionar prenda del catálogo --</option>' +
        this.articulos.map(a => `<option value="${a.id}">${a.nombre} - $${parseFloat(a.precio).toFixed(2)}</option>`).join('');
    }
  },

  alSeleccionarArticulo: function() {
    const id = document.getElementById('venta-articulo-select').value;
    const inputPrecio = document.getElementById('venta-articulo-precio');
    if (!id) {
      inputPrecio.value = '';
      return;
    }

    const art = this.articulos.find(a => a.id == id);
    if (art) {
      inputPrecio.value = parseFloat(art.precio).toFixed(2);
    }
  },

  seleccionarParaVenta: function(idArticulo) {
    this.navegarTab('ventas');
    document.getElementById('venta-articulo-select').value = idArticulo;
    this.alSeleccionarArticulo();
  },

  agregarItemCarrito: function() {
    const selArt = document.getElementById('venta-articulo-select');
    const articuloId = selArt.value;
    const precioUnitario = parseFloat(document.getElementById('venta-articulo-precio').value);
    const cantidad = parseInt(document.getElementById('venta-articulo-cantidad').value);

    if (!articuloId) {
      this.showToast('Atención', 'Seleccione una prenda del catálogo.', 'warning');
      return;
    }
    if (isNaN(precioUnitario) || precioUnitario < 0) {
      this.showToast('Atención', 'Ingrese un precio unitario válido.', 'warning');
      return;
    }
    if (isNaN(cantidad) || cantidad <= 0) {
      this.showToast('Atención', 'La cantidad debe ser al menos 1.', 'warning');
      return;
    }

    const artObj = this.articulos.find(a => a.id == articuloId);
    
    // Si ya existe el artículo en el carrito con el mismo precio, acumular cantidad
    const existenteIndex = this.carrito.findIndex(i => i.articulo_id == articuloId && i.precio_unitario === precioUnitario);

    if (existenteIndex >= 0) {
      this.carrito[existenteIndex].cantidad += cantidad;
    } else {
      this.carrito.push({
        articulo_id: parseInt(articuloId),
        nombre: artObj ? artObj.nombre : 'Artículo',
        cantidad: cantidad,
        precio_unitario: precioUnitario
      });
    }

    this.renderCarrito();
    // Resetear selector
    selArt.value = '';
    document.getElementById('venta-articulo-precio').value = '';
    document.getElementById('venta-articulo-cantidad').value = '1';
  },

  quitarItemCarrito: function(index) {
    this.carrito.splice(index, 1);
    this.renderCarrito();
  },

  renderCarrito: function() {
    const tbody = document.getElementById('tbody-carrito');
    if (!tbody) return;

    if (this.carrito.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="empty-state" style="padding: 2rem;">
            <i class="fa-solid fa-basket-shopping"></i>
            <p>No has agregado artículos a esta factura aún.</p>
          </td>
        </tr>`;
      document.getElementById('resumen-items-count').textContent = '0';
      document.getElementById('resumen-total-venta').textContent = '$0.00';
      return;
    }

    let total = 0;
    let totalItems = 0;

    tbody.innerHTML = this.carrito.map((item, idx) => {
      const subtotal = item.cantidad * item.precio_unitario;
      total += subtotal;
      totalItems += item.cantidad;

      return `
        <tr>
          <td><strong>${idx + 1}</strong></td>
          <td><strong>${item.nombre}</strong></td>
          <td style="text-align: center;">${item.cantidad}</td>
          <td style="text-align: right;">$${item.precio_unitario.toFixed(2)}</td>
          <td style="text-align: right;"><strong>$${subtotal.toFixed(2)}</strong></td>
          <td style="text-align: center;">
            <button type="button" class="ag-btn btn-danger btn-sm" onclick="app.quitarItemCarrito(${idx})" title="Quitar">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    document.getElementById('resumen-items-count').textContent = totalItems;
    document.getElementById('resumen-total-venta').textContent = `$${total.toFixed(2)}`;
  },

  guardarVenta: async function(e) {
    e.preventDefault();
    if (this.carrito.length === 0) {
      this.showToast('Factura vacía', 'Debe añadir al menos una prenda antes de guardar.', 'warning');
      return;
    }

    const clienteId = document.getElementById('venta-cliente-select').value;
    const fecha = document.getElementById('venta-fecha').value;
    const comentario = document.getElementById('venta-comentario').value.trim();

    if (!clienteId || !fecha) {
      this.showToast('Campos requeridos', 'Seleccione cliente y fecha de venta.', 'warning');
      return;
    }

    const btnSubmit = document.getElementById('btn-submit-venta');
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<span class="spinner"></span> Procesando Venta...';

    // Calcular el monto total acumulado del carrito
    const montoTotal = this.carrito.reduce((sum, item) => sum + (item.cantidad * item.precio_unitario), 0);

    try {
      // 1. Guardar ENCABEZADO en la tabla 'ventas' retornando el ID insertado
      const { data: ventaData, error: errorVenta } = await _supabase
        .from('ventas')
        .insert([{
          cliente_id: parseInt(clienteId),
          fecha: fecha,
          comentario: comentario,
          monto_total: montoTotal,
          estado: 'Pendiente'
        }])
        .select('id')
        .single();

      if (errorVenta) throw errorVenta;

      const ventaId = ventaData.id;

      // 2. Preparar el arreglo del DETALLE asociando el venta_id
      // NOTA CLAVE: NO incluir la propiedad 'subtotal' ya que es una columna generada en PostgreSQL
      const detallePayload = this.carrito.map(item => ({
        venta_id: ventaId,
        articulo_id: item.articulo_id,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario
      }));

      // 3. Guardar en la tabla 'detalle_ventas'
      const { error: errorDetalle } = await _supabase
        .from('detalle_ventas')
        .insert(detallePayload);

      if (errorDetalle) {
        // En caso de fallo en el detalle, limpiar la venta huérfana
        await _supabase.from('ventas').delete().eq('id', ventaId);
        throw errorDetalle;
      }

      this.showToast('Venta Guardada', `Factura #${ventaId} registrada con éxito por $${montoTotal.toFixed(2)}.`);
      this.limpiarFormVenta();
      await this.cargarCobranzas();
      this.navegarTab('cobranza');
    } catch (err) {
      console.error('Error al guardar la venta/detalle:', err);
      this.showToast('Error en Venta', err.message || 'No se pudo guardar la factura ni su detalle.', 'danger');
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = '<i class="fa-solid fa-check-double"></i> Confirmar y Guardar Venta';
    }
  },

  limpiarFormVenta: function() {
    document.getElementById('form-venta').reset();
    this.estableserFechaActual();
    this.carrito = [];
    this.renderCarrito();
  },

  // =========================================================================
  // 5. MÓDULO DE COBRANZA / CUENTAS POR COBRAR COMPLETO
  // =========================================================================
  cargarCobranzas: async function() {
    try {
      // Traer facturas con los datos del cliente enlazados y sus cobros acumulados
      const { data, error } = await _supabase
        .from('ventas')
        .select(`
          *,
          clientes (id, nombre, cedula_rif, telefono),
          cobros (*)
        `)
        .order('id', { ascending: false });

      if (error) throw error;

      this.ventas = data || [];
      this.filtrarFacturasCobranza();
      this.actualizarKPIs();
    } catch (err) {
      console.error('Error cargando cobranzas:', err);
      this.showToast('Error', 'No se pudieron consultar las cuentas por cobrar.', 'danger');
    }
  },

  filtrarFacturasCobranza: function() {
    const clienteFiltro = document.getElementById('filtro-cobranza-cliente').value;
    const estadoFiltro = document.getElementById('filtro-cobranza-estado').value;

    let lista = [...this.ventas];

    if (clienteFiltro !== 'TODOS') {
      lista = lista.filter(v => v.cliente_id == clienteFiltro);
    }

    if (estadoFiltro === 'Pendiente') {
      lista = lista.filter(v => v.estado === 'Pendiente' || v.estado === 'Abonada');
    } else if (estadoFiltro === 'Pagada') {
      lista = lista.filter(v => v.estado === 'Pagada');
    }

    this.renderTablaCobranzas(lista);
  },

  renderTablaCobranzas: function(lista) {
    const tbody = document.getElementById('tbody-cobranzas');
    if (!tbody) return;

    if (lista.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="empty-state">
            <i class="fa-solid fa-file-circle-check"></i>
            <p>No hay facturas registradas con los filtros seleccionados.</p>
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = lista.map(v => {
      const clienteNombre = v.clientes ? v.clientes.nombre : 'Cliente Desconocido';
      const total = parseFloat(v.monto_total || 0);
      const totalAbonado = (v.cobros || []).reduce((acc, c) => acc + parseFloat(c.monto || 0), 0);
      const saldo = Math.max(0, total - totalAbonado);

      let badgeClase = 'badge-warning';
      if (v.estado === 'Abonada') badgeClase = 'badge-info';
      if (v.estado === 'Pagada') badgeClase = 'badge-success';

      const deshabilitarCobro = v.estado === 'Pagada' || saldo <= 0;

      return `
        <tr>
          <td><strong>#${v.id}</strong></td>
          <td>
            <strong>${clienteNombre}</strong><br>
            <small style="color: var(--slate-500);">${v.clientes ? v.clientes.cedula_rif : ''}</small>
          </td>
          <td>${v.fecha}</td>
          <td style="text-align: right;">$${total.toFixed(2)}</td>
          <td style="text-align: right; color: var(--success); font-weight: 600;">$${totalAbonado.toFixed(2)}</td>
          <td style="text-align: right; color: var(--danger); font-weight: 700;">$${saldo.toFixed(2)}</td>
          <td style="text-align: center;">
            <span class="ag-badge ${badgeClase}">${v.estado}</span>
          </td>
          <td style="text-align: center;">
            <div style="display: flex; gap: 0.35rem; justify-content: center;">
              <button class="ag-btn btn-primary btn-sm" onclick="app.abrirModalCobro(${v.id})" ${deshabilitarCobro ? 'disabled' : ''} title="Registrar Cobro">
                <i class="fa-solid fa-dollar-sign"></i> Cobrar
              </button>
              <button class="ag-btn btn-outline btn-sm" onclick="app.verDetalleFactura(${v.id})" title="Ver Detalle / Abonos">
                <i class="fa-solid fa-eye"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  filtrarVentasPorCliente: function(clienteId) {
    this.navegarTab('cobranza');
    document.getElementById('filtro-cobranza-cliente').value = clienteId;
    document.getElementById('filtro-cobranza-estado').value = 'TODOS';
    this.filtrarFacturasCobranza();
  },

  // =========================================================================
  // 6. MODALES Y REGISTRO DE COBROS / PAGOS
  // =========================================================================
  abrirModalCobro: function(ventaId) {
    const venta = this.ventas.find(v => v.id == ventaId);
    if (!venta) return;

    const total = parseFloat(venta.monto_total || 0);
    const abonado = (venta.cobros || []).reduce((acc, c) => acc + parseFloat(c.monto || 0), 0);
    const saldo = Math.max(0, total - abonado);

    document.getElementById('modal-cobro-venta-id').value = venta.id;
    document.getElementById('modal-cobro-monto-total').value = total;
    document.getElementById('modal-cobro-saldo-actual').value = saldo;

    document.getElementById('modal-cobro-factura-label').textContent = `Factura #${venta.id} (${venta.fecha})`;
    document.getElementById('modal-cobro-cliente-nombre').textContent = `Cliente: ${venta.clientes ? venta.clientes.nombre : 'S/N'}`;
    document.getElementById('modal-cobro-total').textContent = `$${total.toFixed(2)}`;
    document.getElementById('modal-cobro-abonado').textContent = `$${abonado.toFixed(2)}`;
    document.getElementById('modal-cobro-saldo').textContent = `$${saldo.toFixed(2)}`;

    const elBadge = document.getElementById('modal-cobro-estado-badge');
    elBadge.textContent = venta.estado;
    elBadge.className = `ag-badge ${venta.estado === 'Abonada' ? 'badge-info' : 'badge-warning'}`;

    document.getElementById('cobro-monto').value = saldo.toFixed(2);
    document.getElementById('cobro-monto').max = saldo;

    document.getElementById('modal-cobro').classList.remove('d-none');
  },

  cerrarModalCobro: function() {
    document.getElementById('modal-cobro').classList.add('d-none');
    document.getElementById('form-registrar-cobro').reset();
    this.estableserFechaActual();
  },

  guardarCobro: async function(e) {
    e.preventDefault();
    const ventaId = document.getElementById('modal-cobro-venta-id').value;
    const monto = parseFloat(document.getElementById('cobro-monto').value);
    const saldoActual = parseFloat(document.getElementById('modal-cobro-saldo-actual').value);
    const fecha = document.getElementById('cobro-fecha').value;
    const metodo = document.getElementById('cobro-metodo').value;
    const referencia = document.getElementById('cobro-referencia').value.trim();
    const comentario = document.getElementById('cobro-comentario').value.trim();

    if (isNaN(monto) || monto <= 0) {
      this.showToast('Monto inválido', 'El monto a cobrar debe ser mayor a 0.', 'warning');
      return;
    }

    if (monto > (saldoActual + 0.01)) { // Margen de redondeo
      this.showToast('Exceso de cobro', `El monto superará el saldo pendiente de $${saldoActual.toFixed(2)}.`, 'warning');
      return;
    }

    const btnSubmit = document.getElementById('btn-submit-cobro');
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<span class="spinner"></span> Guardando Pago...';

    try {
      // 1. Insertar cobro
      const { error: errorCobro } = await _supabase.from('cobros').insert([{
        venta_id: parseInt(ventaId),
        fecha_pago: fecha,
        monto: monto,
        metodo_pago: metodo,
        referencia: referencia,
        comentario: comentario
      }]);

      if (errorCobro) throw errorCobro;

      // 2. Determinar nuevo estado de la factura
      const nuevoSaldo = saldoActual - monto;
      let nuevoEstado = 'Abonada';
      if (nuevoSaldo <= 0.01) {
        nuevoEstado = 'Pagada';
      }

      // 3. Actualizar estado de la venta
      const { error: errorVenta } = await _supabase
        .from('ventas')
        .update({ estado: nuevoEstado })
        .eq('id', ventaId);

      if (errorVenta) throw errorVenta;

      this.showToast('Cobro Registrado', `Se guardó el abono de $${monto.toFixed(2)} para la Factura #${ventaId}.`);
      this.cerrarModalCobro();
      await this.cargarCobranzas();
    } catch (err) {
      console.error('Error al registrar cobro:', err);
      this.showToast('Error al cobrar', err.message || 'No se pudo procesar el pago.', 'danger');
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = '<i class="fa-solid fa-check"></i> Registrar Cobro';
    }
  },

  verDetalleFactura: async function(ventaId) {
    const venta = this.ventas.find(v => v.id == ventaId);
    if (!venta) return;

    // Cargar detalle de ítems desde Supabase
    try {
      const { data: items, error } = await _supabase
        .from('detalle_ventas')
        .select(`
          *,
          articulos (nombre)
        `)
        .eq('venta_id', ventaId);

      if (error) throw error;

      // Render Encabezado del modal
      document.getElementById('detalle-factura-header').innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
          <div>
            <h3 style="font-size: 1.2rem; font-weight: 800; color: var(--slate-900);">Factura #${venta.id}</h3>
            <p style="font-size: 0.88rem; color: var(--slate-600);">Cliente: <strong>${venta.clientes ? venta.clientes.nombre : 'S/N'}</strong> (${venta.clientes ? venta.clientes.cedula_rif : ''})</p>
          </div>
          <span class="ag-badge ${venta.estado === 'Pagada' ? 'badge-success' : 'badge-warning'}">${venta.estado}</span>
        </div>
        <p style="font-size: 0.82rem; color: var(--slate-500);">Fecha de emisión: ${venta.fecha} | Nota: ${venta.comentario || 'Sin observaciones'}</p>
      `;

      // Render Ítems Facturados
      const tbodyItems = document.getElementById('tbody-detalle-items');
      if (!items || items.length === 0) {
        tbodyItems.innerHTML = '<tr><td colspan="4" class="empty-state">No hay detalle registrado para esta factura.</td></tr>';
      } else {
        tbodyItems.innerHTML = items.map(it => `
          <tr>
            <td><strong>${it.articulos ? it.articulos.nombre : 'Prenda'}</strong></td>
            <td style="text-align: center;">${it.cantidad}</td>
            <td style="text-align: right;">$${parseFloat(it.precio_unitario).toFixed(2)}</td>
            <td style="text-align: right;"><strong>$${(it.cantidad * parseFloat(it.precio_unitario)).toFixed(2)}</strong></td>
          </tr>
        `).join('');
      }

      // Render Historial de Cobros
      const tbodyCobros = document.getElementById('tbody-detalle-cobros');
      const cobrosList = venta.cobros || [];

      if (cobrosList.length === 0) {
        tbodyCobros.innerHTML = '<tr><td colspan="5" class="empty-state">No se han registrado abonos a esta factura.</td></tr>';
      } else {
        tbodyCobros.innerHTML = cobrosList.map(c => `
          <tr>
            <td>${c.fecha_pago}</td>
            <td><span class="ag-badge badge-info">${c.metodo_pago}</span></td>
            <td>${c.referencia || '-'}</td>
            <td>${c.comentario || '-'}</td>
            <td style="text-align: right; color: var(--success); font-weight: 700;">$${parseFloat(c.monto).toFixed(2)}</td>
          </tr>
        `).join('');
      }

      document.getElementById('modal-detalle-factura').classList.remove('d-none');
    } catch (err) {
      console.error('Error al ver detalle de factura:', err);
      this.showToast('Error', 'No se pudieron recuperar los ítems de la factura.', 'danger');
    }
  },

  cerrarModalDetalle: function() {
    document.getElementById('modal-detalle-factura').classList.add('d-none');
  }
};

// Arrancar la aplicación al cargar el DOM
document.addEventListener('DOMContentLoaded', () => app.init());