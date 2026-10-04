/**
 * =====================================================================
 * ZARELA CLINK - Sistema de Facturación y Cuentas por Cobrar
 * Archivo: js/app.js
 * Descripción: Toda la lógica de interfaz, eventos, validaciones y
 *              consultas/mutaciones con Supabase.
 * =====================================================================
 */

// Estado global de la aplicación en memoria
const state = {
  clientes: [],
  articulos: [],
  ventas: [],
  carritoVenta: [],
  clienteSeleccionadoVenta: null
};

// Objeto de la aplicación con todos los métodos de negocio
const app = {

  // ===================================================================
  // 1. INICIALIZACIÓN
  // ===================================================================
  async init() {
    console.log('🚀 Inicializando Sistema Zarela Clink...');

    // Asignar fecha de hoy a los inputs de fecha
    const hoy = new Date().toISOString().split('T')[0];
    const fechaVentaInput = document.getElementById('venta-fecha');
    const cobroFechaInput = document.getElementById('cobro-fecha');
    if (fechaVentaInput) fechaVentaInput.value = hoy;
    if (cobroFechaInput) cobroFechaInput.value = hoy;

    // Verificar si Supabase está listo
    if (!window.supabaseClient) {
      this.mostrarToast('Error de Conexión', 'No se pudo conectar con Supabase. Revisa tus credenciales.', 'danger');
      return;
    }

    try {
      // Cargar datos en paralelo para máxima velocidad
      await Promise.all([
        this.cargarClientes(),
        this.cargarArticulos(),
        this.cargarCobranzas()
      ]);
      console.log('✅ Datos iniciales cargados exitosamente.');
    } catch (error) {
      console.error('Error al inicializar datos:', error);
      this.mostrarToast('Atención', 'Ocurrió un error al cargar la información inicial.', 'warning');
    }
  },

  // ===================================================================
  // 2. SISTEMA DE NAVEGACIÓN (AntiGravity CSS Tabs)
  // ===================================================================
  navegarTab(tabDestino) {
    const tabs = ['clientes', 'articulos', 'ventas', 'cobranza'];

    tabs.forEach(tab => {
      const seccion = document.getElementById(`tab-${tab}`);
      const boton = document.getElementById(`nav-btn-${tab}`);

      if (tab === tabDestino) {
        // Mostrar sección activa
        if (seccion) seccion.classList.remove('d-none');
        // Activar estilo botón
        if (boton) {
          boton.classList.remove('btn-outline');
          boton.classList.add('btn-primary', 'active-tab');
        }
      } else {
        // Ocultar otras secciones
        if (seccion) seccion.classList.add('d-none');
        // Estilo secundario botón
        if (boton) {
          boton.classList.remove('btn-primary', 'active-tab');
          boton.classList.add('btn-outline');
        }
      }
    });

    // Actualizar selectores al entrar a ventas o cobranza
    if (tabDestino === 'ventas') {
      this.poblarSelectoresVenta();
    } else if (tabDestino === 'cobranza') {
      this.cargarCobranzas();
    }
  },

  // ===================================================================
  // 3. MAESTRO DE CLIENTES
  // ===================================================================
  async cargarClientes() {
    const tbody = document.getElementById('tbody-clientes');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="empty-state">
            <i class="fa-solid fa-spinner fa-spin"></i>
            <p>Cargando clientes...</p>
          </td>
        </tr>`;
    }

    const { data, error } = await window.supabaseClient
      .from('clientes')
      .select('*')
      .order('nombre', { ascending: true });

    if (error) {
      console.error('Error al cargar clientes:', error);
      this.mostrarToast('Error', 'No se pudieron consultar los clientes.', 'danger');
      return;
    }

    state.clientes = data || [];
    this.renderizarClientes(state.clientes);
    this.poblarSelectoresVenta();
    this.poblarFiltroClientesCobranza();
    this.actualizarKPIs();
  },

  renderizarClientes(lista) {
    const tbody = document.getElementById('tbody-clientes');
    if (!tbody) return;

    if (!lista || lista.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="empty-state">
            <i class="fa-solid fa-users-slash"></i>
            <p>No hay clientes registrados en el sistema.</p>
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = lista.map(c => {
      const deuda = this.calcularDeudaCliente(c.id);

      return `
      <tr>
        <td style="font-weight: 700; color: var(--slate-500);">#${c.id}</td>
        <td>
          <div style="font-weight: 600; color: var(--slate-900);">${this.escaparHtml(c.nombre)}</div>
        </td>
        <td>
          <span class="ag-badge" style="background-color: var(--slate-100); color: var(--slate-700); border: 1px solid var(--slate-200);">
            ${this.escaparHtml(c.cedula_rif || 'N/A')}
          </span>
        </td>
        <td>${this.escaparHtml(c.telefono || 'Sin teléfono')}</td>
        <td>${this.escaparHtml(c.correo || 'Sin correo')}</td>
        <td style="max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${this.escaparHtml(c.direccion || '')}">
          ${this.escaparHtml(c.direccion || 'Sin dirección')}
        </td>
        <td style="text-align: right; font-weight: 700; color: ${deuda > 0.009 ? 'var(--danger)' : 'var(--success)'};">
          $${deuda.toFixed(2)}
        </td>
        <td style="text-align: right;">
          <button class="ag-btn btn-primary btn-sm" onclick="app.facturarACliente(${c.id})" title="Crear nueva factura para este cliente">
            <i class="fa-solid fa-file-invoice"></i> Facturar
          </button>
        </td>
      </tr>
    `;
    }).join('');
  },

  calcularDeudaCliente(clienteId) {
    return state.ventas
      .filter(v => v.cliente_id === clienteId)
      .reduce((acc, v) => {
        const montoTotal = parseFloat(v.monto_total || 0);
        const cobrosArray = Array.isArray(v.cobros) ? v.cobros : [];
        const totalAbonado = cobrosArray.reduce((sum, c) => sum + parseFloat(c.monto || 0), 0);
        return acc + Math.max(0, montoTotal - totalAbonado);
      }, 0);
  },

  filtrarClientes() {
    const termino = (document.getElementById('buscar-cliente')?.value || '').toLowerCase().trim();
    if (!termino) {
      this.renderizarClientes(state.clientes);
      return;
    }

    const filtrados = state.clientes.filter(c => 
      (c.nombre && c.nombre.toLowerCase().includes(termino)) ||
      (c.cedula_rif && c.cedula_rif.toLowerCase().includes(termino)) ||
      (c.telefono && c.telefono.toLowerCase().includes(termino)) ||
      (c.correo && c.correo.toLowerCase().includes(termino))
    );
    this.renderizarClientes(filtrados);
  },

  async guardarCliente(event) {
    if (event) event.preventDefault();
    const btnSubmit = document.getElementById('btn-submit-cliente');
    const originalText = btnSubmit ? btnSubmit.innerHTML : '';

    const nombre = document.getElementById('cliente-nombre')?.value.trim();
    const cedula_rif = document.getElementById('cliente-rif')?.value.trim();
    const telefono = document.getElementById('cliente-telefono')?.value.trim();
    const correo = document.getElementById('cliente-correo')?.value.trim();
    const direccion = document.getElementById('cliente-direccion')?.value.trim();

    if (!nombre || !cedula_rif) {
      this.mostrarToast('Campos requeridos', 'Por favor ingresa Nombre y Cédula/RIF.', 'warning');
      return;
    }

    try {
      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = `<span class="spinner"></span> Guardando...`;
      }

      const nuevoCliente = {
        nombre,
        cedula_rif,
        telefono: telefono || null,
        correo: correo || null,
        direccion: direccion || null
      };

      const { data, error } = await window.supabaseClient
        .from('clientes')
        .insert([nuevoCliente])
        .select();

      if (error) {
        if (error.code === '23505') {
          throw new Error('Ya existe un cliente registrado con esa Cédula o RIF.');
        }
        throw error;
      }

      this.mostrarToast('¡Cliente Registrado!', `${nombre} guardado correctamente.`, 'success');
      document.getElementById('form-cliente')?.reset();
      await this.cargarClientes();
    } catch (err) {
      console.error('Error al guardar cliente:', err);
      this.mostrarToast('Error al Guardar', err.message || 'No se pudo guardar el cliente en Supabase.', 'danger');
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = originalText;
      }
    }
  },

  facturarACliente(clienteId) {
    this.navegarTab('ventas');
    const select = document.getElementById('venta-cliente-select');
    if (select) {
      select.value = clienteId;
    }
  },

  // ===================================================================
  // 4. MAESTRO DE ARTÍCULOS
  // ===================================================================
  async cargarArticulos() {
    const tbody = document.getElementById('tbody-articulos');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="empty-state">
            <i class="fa-solid fa-spinner fa-spin"></i>
            <p>Cargando catálogo...</p>
          </td>
        </tr>`;
    }

    const { data, error } = await window.supabaseClient
      .from('articulos')
      .select('*')
      .order('nombre', { ascending: true });

    if (error) {
      console.error('Error al cargar artículos:', error);
      this.mostrarToast('Error', 'No se pudieron consultar los artículos.', 'danger');
      return;
    }

    state.articulos = data || [];
    this.renderizarArticulos(state.articulos);
    this.poblarSelectoresVenta();
    this.actualizarKPIs();
  },

  renderizarArticulos(lista) {
    const tbody = document.getElementById('tbody-articulos');
    if (!tbody) return;

    if (!lista || lista.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="empty-state">
            <i class="fa-solid fa-shirt"></i>
            <p>No hay artículos ni uniformes registrados en el catálogo.</p>
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = lista.map(a => {
      const costo = parseFloat(a.costo || 0);
      const precio = parseFloat(a.precio || 0);
      let margen = 0;
      if (precio > 0) {
        margen = ((precio - costo) / precio) * 100;
      }

      return `
        <tr>
          <td style="font-weight: 700; color: var(--slate-500);">#${a.id}</td>
          <td>
            <div style="font-weight: 600; color: var(--slate-900); display: flex; align-items: center; gap: 0.5rem;">
              <i class="fa-solid fa-shirt" style="color: var(--primary);"></i>
              ${this.escaparHtml(a.nombre)}
            </div>
          </td>
          <td>$${costo.toFixed(2)}</td>
          <td style="font-weight: 700; color: var(--primary);">$${precio.toFixed(2)}</td>
          <td>
            <span class="ag-badge ${margen >= 30 ? 'badge-success' : 'badge-warning'}">
              ${margen.toFixed(1)}% Margen
            </span>
          </td>
          <td style="text-align: right;">
            <button class="ag-btn btn-outline btn-sm" onclick="app.agregarArticuloRapidoAVenta(${a.id})" title="Añadir a nueva venta">
              <i class="fa-solid fa-cart-plus"></i> Usar en Factura
            </button>
          </td>
        </tr>
      `;
    }).join('');
  },

  filtrarArticulos() {
    const termino = (document.getElementById('buscar-articulo')?.value || '').toLowerCase().trim();
    if (!termino) {
      this.renderizarArticulos(state.articulos);
      return;
    }

    const filtrados = state.articulos.filter(a => 
      a.nombre && a.nombre.toLowerCase().includes(termino)
    );
    this.renderizarArticulos(filtrados);
  },

  async guardarArticulo(event) {
    if (event) event.preventDefault();
    const btnSubmit = document.getElementById('btn-submit-articulo');
    const originalText = btnSubmit ? btnSubmit.innerHTML : '';

    const nombre = document.getElementById('articulo-nombre')?.value.trim();
    const costo = parseFloat(document.getElementById('articulo-costo')?.value || 0);
    const precio = parseFloat(document.getElementById('articulo-precio')?.value || 0);

    if (!nombre) {
      this.mostrarToast('Campo requerido', 'Ingresa la descripción o nombre de la prenda.', 'warning');
      return;
    }

    if (costo < 0 || precio < 0) {
      this.mostrarToast('Valores Inválidos', 'El costo y precio no pueden ser negativos.', 'warning');
      return;
    }

    try {
      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = `<span class="spinner"></span> Guardando...`;
      }

      const nuevoArticulo = {
        nombre,
        costo,
        precio
      };

      const { data, error } = await window.supabaseClient
        .from('articulos')
        .insert([nuevoArticulo])
        .select();

      if (error) throw error;

      this.mostrarToast('¡Artículo Guardado!', `${nombre} añadido al catálogo con éxito.`, 'success');
      document.getElementById('form-articulo')?.reset();
      await this.cargarArticulos();
    } catch (err) {
      console.error('Error al guardar artículo:', err);
      this.mostrarToast('Error al Guardar', err.message || 'No se pudo guardar el artículo.', 'danger');
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = originalText;
      }
    }
  },

  agregarArticuloRapidoAVenta(articuloId) {
    this.navegarTab('ventas');
    const select = document.getElementById('venta-articulo-select');
    if (select) {
      select.value = articuloId;
      this.alSeleccionarArticulo();
    }
  },

  // ===================================================================
  // 5. MÓDULO DE VENTAS / FACTURACIÓN
  // ===================================================================
  poblarSelectoresVenta() {
    // 1. Selector de clientes
    const selectCliente = document.getElementById('venta-cliente-select');
    if (selectCliente) {
      const valorActual = selectCliente.value;
      selectCliente.innerHTML = `<option value="">-- Seleccione un cliente (${state.clientes.length} disponibles) --</option>` +
        state.clientes.map(c => `
          <option value="${c.id}">${this.escaparHtml(c.nombre)} [RIF: ${this.escaparHtml(c.cedula_rif || 'N/A')}]</option>
        `).join('');
      if (valorActual) selectCliente.value = valorActual;
    }

    // 2. Selector de artículos
    const selectArticulo = document.getElementById('venta-articulo-select');
    if (selectArticulo) {
      const valorActual = selectArticulo.value;
      selectArticulo.innerHTML = `<option value="">-- Seleccionar prenda del catálogo (${state.articulos.length} disponibles) --</option>` +
        state.articulos.map(a => `
          <option value="${a.id}" data-precio="${a.precio}">
            ${this.escaparHtml(a.nombre)} - Sugerido: $${parseFloat(a.precio || 0).toFixed(2)}
          </option>
        `).join('');
      if (valorActual) selectArticulo.value = valorActual;
    }
  },

  alSeleccionarArticulo() {
    const selectArticulo = document.getElementById('venta-articulo-select');
    const inputPrecio = document.getElementById('venta-articulo-precio');
    const inputCantidad = document.getElementById('venta-articulo-cantidad');

    if (!selectArticulo || !inputPrecio) return;

    const articuloId = parseInt(selectArticulo.value, 10);
    const articulo = state.articulos.find(a => a.id === articuloId);

    if (articulo) {
      inputPrecio.value = parseFloat(articulo.precio || 0).toFixed(2);
      if (!inputCantidad.value || parseInt(inputCantidad.value, 10) < 1) {
        inputCantidad.value = 1;
      }
      inputPrecio.focus();
    } else {
      inputPrecio.value = '';
    }
  },

  agregarItemCarrito() {
    const selectArticulo = document.getElementById('venta-articulo-select');
    const inputPrecio = document.getElementById('venta-articulo-precio');
    const inputCantidad = document.getElementById('venta-articulo-cantidad');

    const articuloId = parseInt(selectArticulo?.value, 10);
    const precioUnitario = parseFloat(inputPrecio?.value);
    const cantidad = parseInt(inputCantidad?.value, 10);

    if (!articuloId || isNaN(articuloId)) {
      this.mostrarToast('Atención', 'Selecciona una prenda o artículo del catálogo.', 'warning');
      selectArticulo?.focus();
      return;
    }

    if (isNaN(precioUnitario) || precioUnitario < 0) {
      this.mostrarToast('Atención', 'Ingresa un precio unitario válido.', 'warning');
      inputPrecio?.focus();
      return;
    }

    if (isNaN(cantidad) || cantidad <= 0) {
      this.mostrarToast('Atención', 'La cantidad debe ser mayor a 0.', 'warning');
      inputCantidad?.focus();
      return;
    }

    const articulo = state.articulos.find(a => a.id === articuloId);
    const nombreArticulo = articulo ? articulo.nombre : 'Artículo #' + articuloId;
    const subtotal = parseFloat((cantidad * precioUnitario).toFixed(2));

    const indexExistente = state.carritoVenta.findIndex(item => item.articulo_id === articuloId && item.precio_unitario === precioUnitario);
    if (indexExistente !== -1) {
      state.carritoVenta[indexExistente].cantidad += cantidad;
      state.carritoVenta[indexExistente].subtotal = parseFloat((state.carritoVenta[indexExistente].cantidad * precioUnitario).toFixed(2));
      this.mostrarToast('Ítem Actualizado', `Se incrementó la cantidad de ${nombreArticulo}.`, 'info');
    } else {
      state.carritoVenta.push({
        articulo_id: articuloId,
        nombre: nombreArticulo,
        cantidad,
        precio_unitario: precioUnitario,
        subtotal
      });
      this.mostrarToast('Ítem Agregado', `${nombreArticulo} añadido a la factura.`, 'success');
    }

    selectArticulo.value = '';
    inputPrecio.value = '';
    inputCantidad.value = '1';

    this.renderizarCarrito();
  },

  eliminarItemCarrito(index) {
    if (index >= 0 && index < state.carritoVenta.length) {
      const removido = state.carritoVenta.splice(index, 1)[0];
      this.renderizarCarrito();
      this.mostrarToast('Ítem Removido', `${removido.nombre} fue quitado de la factura.`, 'info');
    }
  },

  renderizarCarrito() {
    const tbody = document.getElementById('tbody-carrito');
    const resumenCount = document.getElementById('resumen-items-count');
    const resumenTotal = document.getElementById('resumen-total-venta');

    if (!tbody) return;

    if (state.carritoVenta.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="empty-state" style="padding: 2rem;">
            <i class="fa-solid fa-basket-shopping"></i>
            <p>No has agregado artículos a esta factura aún.</p>
          </td>
        </tr>`;
      if (resumenCount) resumenCount.textContent = '0 prendas';
      if (resumenTotal) resumenTotal.textContent = '$0.00';
      return;
    }

    let total = 0;
    let totalUnidades = 0;

    tbody.innerHTML = state.carritoVenta.map((item, idx) => {
      total += item.subtotal;
      totalUnidades += item.cantidad;

      return `
        <tr>
          <td style="font-weight: 700; color: var(--slate-500);">${idx + 1}</td>
          <td>
            <div style="font-weight: 600; color: var(--slate-900);">${this.escaparHtml(item.nombre)}</div>
          </td>
          <td style="text-align: center; font-weight: 600;">
            ${item.cantidad}
          </td>
          <td style="text-align: right; color: var(--slate-700);">$${item.precio_unitario.toFixed(2)}</td>
          <td style="text-align: right; font-weight: 700; color: var(--primary);">$${item.subtotal.toFixed(2)}</td>
          <td style="text-align: center;">
            <button type="button" class="ag-btn btn-danger btn-sm" onclick="app.eliminarItemCarrito(${idx})" title="Eliminar ítem">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    if (resumenCount) resumenCount.textContent = `${totalUnidades} unidades (${state.carritoVenta.length} tipos de prendas)`;
    if (resumenTotal) resumenTotal.textContent = `$${total.toFixed(2)}`;
  },

  limpiarFormVenta() {
    document.getElementById('form-venta')?.reset();
    state.carritoVenta = [];
    const hoy = new Date().toISOString().split('T')[0];
    const fechaInput = document.getElementById('venta-fecha');
    if (fechaInput) fechaInput.value = hoy;
    this.renderizarCarrito();
  },

async guardarVenta(event) {
    if (event) event.preventDefault();
    const btnSubmit = document.getElementById('btn-submit-venta');
    const originalText = btnSubmit ? btnSubmit.innerHTML : '';

    const clienteId = parseInt(document.getElementById('venta-cliente-select')?.value, 10);
    const fecha = document.getElementById('venta-fecha')?.value;
    const comentario = document.getElementById('venta-comentario')?.value.trim();

    if (!clienteId || isNaN(clienteId)) {
      this.mostrarToast('Validación', 'Por favor selecciona el cliente para la factura.', 'warning');
      return;
    }

    if (!fecha) {
      this.mostrarToast('Validación', 'Selecciona la fecha de emisión de la factura.', 'warning');
      return;
    }

    if (state.carritoVenta.length === 0) {
      this.mostrarToast('Factura Vacía', 'Debes añadir al menos un artículo antes de guardar la venta.', 'warning');
      return;
    }

    const montoTotal = state.carritoVenta.reduce((acc, item) => acc + item.subtotal, 0);

    try {
      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = `<span class="spinner"></span> Registrando Factura...`;
      }

      // 1. Guardar cabecera de la venta
      const nuevaVenta = {
        cliente_id: clienteId,
        fecha: fecha,
        comentario: comentario || null,
        monto_total: montoTotal,
        estado: 'Pendiente'
      };

      const { data: ventaCreada, error: errorVenta } = await window.supabaseClient
        .from('ventas')
        .insert([nuevaVenta])
        .select();

      if (errorVenta) throw errorVenta;
      if (!ventaCreada || ventaCreada.length === 0) {
        throw new Error('No se pudo obtener el ID de la venta creada.');
      }

      const ventaId = ventaCreada[0].id;

     // 2. Mapeo explícito de los ítems para detalle_ventas (sin enviar subtotal)
      const detallesAInsertar = state.carritoVenta.map(item => ({
        venta_id: ventaId,
        articulo_id: item.articulo_id,
        cantidad: parseInt(item.cantidad, 10),
        precio_unitario: parseFloat(item.precio_unitario)
      }));

      const { error: errorDetalles } = await window.supabaseClient
        .from('detalle_ventas')
        .insert(detallesAInsertar);

      if (errorDetalles) {
        // Muestra en la consola de F12 el error exacto entregado por Supabase
        console.error('Detalle completo del error en Supabase:', errorDetalles);
        throw new Error(`Error en Supabase (${errorDetalles.code}): ${errorDetalles.message}`);
      }

      this.mostrarToast(
        '¡Venta Emitida con Éxito!',
        `Factura #VNT-${ventaId} por $${montoTotal.toFixed(2)} generada correctamente.`,
        'success'
      );

      this.limpiarFormVenta();
      await this.cargarCobranzas();

      setTimeout(() => {
        this.navegarTab('cobranza');
      }, 900);

    } catch (err) {
      console.error('Error en guardarVenta:', err);
      this.mostrarToast('Error al Guardar Detalle', err.message || 'Error en la transacción de Supabase.', 'danger');
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = originalText;
      }
    }
  },

  // ===================================================================
  // 6. MÓDULO DE COBRANZA / CUENTAS POR COBRAR
  // ===================================================================
  async cargarCobranzas() {
    const tbody = document.getElementById('tbody-cobranzas');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="empty-state">
            <i class="fa-solid fa-spinner fa-spin"></i>
            <p>Cargando facturas y cuentas por cobrar...</p>
          </td>
        </tr>`;
    }

    try {
      const { data, error } = await window.supabaseClient
        .from('ventas')
        .select(`
          *,
          clientes (id, nombre, cedula_rif, telefono),
          cobros (*)
        `)
        .order('id', { ascending: false });

      if (error) throw error;

      state.ventas = data || [];
      this.filtrarFacturasCobranza();
      this.filtrarClientes();
      this.actualizarKPIs();
    } catch (err) {
      console.error('Error al cargar cobranzas:', err);
      this.mostrarToast('Error', 'No se pudieron consultar las facturas de cobranza.', 'danger');
    }
  },

  poblarFiltroClientesCobranza() {
    const filtroCliente = document.getElementById('filtro-cobranza-cliente');
    if (!filtroCliente) return;

    const valorActual = filtroCliente.value;
    filtroCliente.innerHTML = `<option value="TODOS">-- Todos los Clientes --</option>` +
      state.clientes.map(c => `
        <option value="${c.id}">${this.escaparHtml(c.nombre)}</option>
      `).join('');

    if (valorActual) filtroCliente.value = valorActual;
  },

  filtrarFacturasCobranza() {
    const clienteIdFiltro = document.getElementById('filtro-cobranza-cliente')?.value || 'TODOS';
    const estadoFiltro = document.getElementById('filtro-cobranza-estado')?.value || 'TODOS';

    let filtradas = [...state.ventas];

    if (clienteIdFiltro !== 'TODOS') {
      const idNum = parseInt(clienteIdFiltro, 10);
      filtradas = filtradas.filter(v => v.cliente_id === idNum);
    }

    if (estadoFiltro === 'Pendiente') {
      filtradas = filtradas.filter(v => v.estado === 'Pendiente' || v.estado === 'Abonada');
    } else if (estadoFiltro === 'Pagada') {
      filtradas = filtradas.filter(v => v.estado === 'Pagada');
    }

    this.renderizarCobranzas(filtradas);
  },

  renderizarCobranzas(lista) {
    const tbody = document.getElementById('tbody-cobranzas');
    if (!tbody) return;

    if (!lista || lista.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="empty-state">
            <i class="fa-solid fa-file-circle-check"></i>
            <p>No se encontraron facturas con los filtros seleccionados.</p>
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = lista.map(v => {
      const montoTotal = parseFloat(v.monto_total || 0);
      const cobrosArray = Array.isArray(v.cobros) ? v.cobros : [];
      const totalAbonado = cobrosArray.reduce((acc, c) => acc + parseFloat(c.monto || 0), 0);
      const saldoPendiente = Math.max(0, montoTotal - totalAbonado);

      let badgeClass = 'badge-warning';
      let badgeIcon = 'fa-clock';
      if (v.estado === 'Pagada' || saldoPendiente <= 0.009) {
        badgeClass = 'badge-success';
        badgeIcon = 'fa-circle-check';
      } else if (v.estado === 'Abonada' || totalAbonado > 0) {
        badgeClass = 'badge-info';
        badgeIcon = 'fa-percent';
      }

      const clienteNombre = v.clientes ? v.clientes.nombre : 'Cliente Desconocido';
      const clienteRif = v.clientes && v.clientes.cedula_rif ? `[${v.clientes.cedula_rif}]` : '';
      const tieneSaldo = saldoPendiente > 0.009;

      return `
        <tr>
          <td style="font-weight: 700; color: var(--slate-900);">
            #VNT-${v.id}
          </td>
          <td>
            <div style="font-weight: 600; color: var(--slate-900);">${this.escaparHtml(clienteNombre)}</div>
            <div style="font-size: 0.75rem; color: var(--slate-500);">${this.escaparHtml(clienteRif)}</div>
          </td>
          <td>${v.fecha || 'Sin fecha'}</td>
          <td style="text-align: right; font-weight: 600;">$${montoTotal.toFixed(2)}</td>
          <td style="text-align: right; font-weight: 600; color: var(--success);">$${totalAbonado.toFixed(2)}</td>
          <td style="text-align: right; font-weight: 800; font-size: 0.95rem; color: ${tieneSaldo ? 'var(--danger)' : 'var(--success)'};">
            $${saldoPendiente.toFixed(2)}
          </td>
          <td style="text-align: center;">
            <span class="ag-badge ${badgeClass}">
              <i class="fa-solid ${badgeIcon}"></i> ${v.estado}
            </span>
          </td>
          <td style="text-align: center;">
            <div style="display: flex; gap: 0.35rem; justify-content: center;">
              ${tieneSaldo ? `
                <button class="ag-btn btn-primary btn-sm" onclick="app.abrirModalCobro(${v.id})" title="Registrar Cobro / Abono">
                  <i class="fa-solid fa-hand-holding-dollar"></i> Cobrar
                </button>
              ` : `
                <button class="ag-btn btn-outline btn-sm" disabled style="opacity: 0.5;">
                  <i class="fa-solid fa-check"></i> Pagada
                </button>
              `}
              <button class="ag-btn btn-outline btn-sm" onclick="app.verDetalleFactura(${v.id})" title="Ver artículos y recibos de pago">
                <i class="fa-solid fa-eye"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  abrirModalCobro(ventaId) {
    const venta = state.ventas.find(v => v.id === ventaId);
    if (!venta) {
      this.mostrarToast('Error', 'No se encontró la factura seleccionada.', 'danger');
      return;
    }

    const montoTotal = parseFloat(venta.monto_total || 0);
    const cobrosArray = Array.isArray(venta.cobros) ? venta.cobros : [];
    const totalAbonado = cobrosArray.reduce((acc, c) => acc + parseFloat(c.monto || 0), 0);
    const saldoPendiente = Math.max(0, montoTotal - totalAbonado);

    const inputVentaId = document.getElementById('modal-cobro-venta-id');
    const inputMontoTotal = document.getElementById('modal-cobro-monto-total');
    const inputSaldoActual = document.getElementById('modal-cobro-saldo-actual');

    if (inputVentaId) inputVentaId.value = venta.id;
    if (inputMontoTotal) inputMontoTotal.value = montoTotal;
    if (inputSaldoActual) inputSaldoActual.value = saldoPendiente;

    const lblFactura = document.getElementById('modal-cobro-factura-label');
    const lblCliente = document.getElementById('modal-cobro-cliente-nombre');
    const lblTotal = document.getElementById('modal-cobro-total');
    const lblAbonado = document.getElementById('modal-cobro-abonado');
    const lblSaldo = document.getElementById('modal-cobro-saldo');

    if (lblFactura) lblFactura.textContent = `Factura #VNT-${venta.id}`;
    if (lblCliente) lblCliente.textContent = `Cliente: ${venta.clientes ? venta.clientes.nombre : 'General'}`;
    if (lblTotal) lblTotal.textContent = `$${montoTotal.toFixed(2)}`;
    if (lblAbonado) lblAbonado.textContent = `$${totalAbonado.toFixed(2)}`;
    if (lblSaldo) lblSaldo.textContent = `$${saldoPendiente.toFixed(2)}`;

    const inputMonto = document.getElementById('cobro-monto');
    if (inputMonto) {
      inputMonto.value = saldoPendiente.toFixed(2);
      inputMonto.max = saldoPendiente.toFixed(2);
    }

    const inputFecha = document.getElementById('cobro-fecha');
    if (inputFecha) {
      inputFecha.value = new Date().toISOString().split('T')[0];
    }

    const refInput = document.getElementById('cobro-referencia');
    const comInput = document.getElementById('cobro-comentario');
    if (refInput) refInput.value = '';
    if (comInput) comInput.value = '';

    const modal = document.getElementById('modal-cobro');
    if (modal) modal.classList.remove('d-none');
  },

  cerrarModalCobro() {
    const modal = document.getElementById('modal-cobro');
    if (modal) modal.classList.add('d-none');
  },

  async guardarCobro(event) {
    if (event) event.preventDefault();
    const btnSubmit = document.getElementById('btn-submit-cobro');
    const originalText = btnSubmit ? btnSubmit.innerHTML : '';

    const ventaId = parseInt(document.getElementById('modal-cobro-venta-id')?.value, 10);
    const montoCobrado = parseFloat(document.getElementById('cobro-monto')?.value);
    const fechaPago = document.getElementById('cobro-fecha')?.value;
    const metodoPago = document.getElementById('cobro-metodo')?.value;
    const referencia = document.getElementById('cobro-referencia')?.value.trim();
    const comentario = document.getElementById('cobro-comentario')?.value.trim();

    const venta = state.ventas.find(v => v.id === ventaId);
    if (!venta) {
      this.mostrarToast('Error', 'Venta no localizada.', 'danger');
      return;
    }

    const montoTotalVenta = parseFloat(venta.monto_total || 0);

    if (isNaN(montoCobrado) || montoCobrado <= 0) {
      this.mostrarToast('Monto Inválido', 'El monto a cobrar debe ser mayor a 0.', 'warning');
      return;
    }

    try {
      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = `<span class="spinner"></span> Procesando Cobro...`;
      }

      const nuevoCobro = {
        venta_id: ventaId,
        fecha_pago: fechaPago,
        monto: montoCobrado,
        metodo_pago: metodoPago,
        referencia: referencia || null,
        comentario: comentario || null
      };

      const { data: cobroCreado, error: errorCobro } = await window.supabaseClient
        .from('cobros')
        .insert([nuevoCobro])
        .select();

      if (errorCobro) throw errorCobro;

      const { data: todosLosCobros, error: errorSuma } = await window.supabaseClient
        .from('cobros')
        .select('monto')
        .eq('venta_id', ventaId);

      if (errorSuma) throw errorSuma;

      const totalAcumuladoCobrado = (todosLosCobros || []).reduce((acc, c) => acc + parseFloat(c.monto || 0), 0);

      let nuevoEstado = 'Pendiente';
      if (totalAcumuladoCobrado >= montoTotalVenta - 0.009) {
        nuevoEstado = 'Pagada';
      } else if (totalAcumuladoCobrado > 0) {
        nuevoEstado = 'Abonada';
      }

      const { error: errorUpdateVenta } = await window.supabaseClient
        .from('ventas')
        .update({ estado: nuevoEstado })
        .eq('id', ventaId);

      if (errorUpdateVenta) throw errorUpdateVenta;

      this.cerrarModalCobro();

      const saldoRestante = Math.max(0, montoTotalVenta - totalAcumuladoCobrado);
      this.mostrarToast(
        '¡Cobro Registrado!',
        `Cobro por $${montoCobrado.toFixed(2)} procesado vía ${metodoPago}. Estado: ${nuevoEstado}`,
        'success'
      );

      await this.cargarCobranzas();

    } catch (err) {
      console.error('Error al guardar cobro:', err);
      this.mostrarToast('Error en Cobranza', err.message || 'No se pudo registrar el cobro en Supabase.', 'danger');
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = originalText;
      }
    }
  },

  async verDetalleFactura(ventaId) {
    const modal = document.getElementById('modal-detalle-factura');
    const header = document.getElementById('detalle-factura-header');
    const tbodyItems = document.getElementById('tbody-detalle-items');
    const tbodyCobros = document.getElementById('tbody-detalle-cobros');

    if (modal) modal.classList.remove('d-none');
    if (header) header.innerHTML = `<p class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i> Cargando factura...</p>`;
    if (tbodyItems) tbodyItems.innerHTML = `<tr><td colspan="4" class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i></td></tr>`;
    if (tbodyCobros) tbodyCobros.innerHTML = `<tr><td colspan="5" class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i></td></tr>`;

    try {
      // 1. Obtener datos de la venta y cliente
      const { data: venta, error: errorVenta } = await window.supabaseClient
        .from('ventas')
        .select(`
          *,
          clientes (*)
        `)
        .eq('id', ventaId)
        .single();

      if (errorVenta) throw errorVenta;

      // 2. Obtener detalle de items y articulos de la venta
      const { data: detalles, error: errorDetalles } = await window.supabaseClient
        .from('detalle_ventas')
        .select(`
          *,
          articulos (*)
        `)
        .eq('venta_id', ventaId);

      if (errorDetalles) console.warn('Aviso al cargar detalle_ventas:', errorDetalles);

      // 3. Obtener cobros asociados
      const { data: cobros, error: errorCobros } = await window.supabaseClient
        .from('cobros')
        .select('*')
        .eq('venta_id', ventaId);

      if (errorCobros) console.warn('Aviso al cargar cobros:', errorCobros);

      const listaCobros = cobros || [];
      const listaDetalles = detalles || [];

      const totalAbonado = listaCobros.reduce((acc, c) => acc + parseFloat(c.monto || 0), 0);
      const saldoPendiente = Math.max(0, parseFloat(venta.monto_total || 0) - totalAbonado);

      // Renderizar Cabecera
      header.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; border-bottom: 1px solid var(--slate-200); padding-bottom: 1rem;">
          <div>
            <h3 style="font-size: 1.3rem; font-weight: 800; color: var(--slate-900);">Factura #VNT-${venta.id}</h3>
            <div style="font-size: 0.85rem; color: var(--slate-600); margin-top: 0.25rem;">
              <strong>Cliente:</strong> ${this.escaparHtml(venta.clientes?.nombre || 'General')} &bull; 
              <strong>RIF:</strong> ${this.escaparHtml(venta.clientes?.cedula_rif || 'N/A')}
            </div>
            <div style="font-size: 0.85rem; color: var(--slate-600);">
              <strong>Fecha:</strong> ${venta.fecha || 'N/A'} &bull; 
              <strong>Nota:</strong> ${this.escaparHtml(venta.comentario || 'Sin observaciones')}
            </div>
          </div>
          <div style="text-align: right;">
            <span class="ag-badge ${venta.estado === 'Pagada' ? 'badge-success' : (venta.estado === 'Abonada' ? 'badge-info' : 'badge-warning')}">
              ${venta.estado}
            </span>
            <div style="margin-top: 0.5rem; font-size: 1.15rem; font-weight: 800; color: var(--primary);">
              Total: $${parseFloat(venta.monto_total || 0).toFixed(2)}
            </div>
            <div style="font-size: 0.85rem; color: ${saldoPendiente > 0 ? 'var(--danger)' : 'var(--success)'}; font-weight: 600;">
              Saldo: $${saldoPendiente.toFixed(2)}
            </div>
          </div>
        </div>
      `;

      // Renderizar Items Facturados
      if (listaDetalles.length === 0) {
        tbodyItems.innerHTML = `<tr><td colspan="4" class="empty-state"><p>No se encontraron registros de prendas para esta venta.</p></td></tr>`;
      } else {
        tbodyItems.innerHTML = listaDetalles.map(d => `
          <tr>
            <td>
              <div style="font-weight: 600; color: var(--slate-900);">${this.escaparHtml(d.articulos?.nombre || 'Prenda #' + d.articulo_id)}</div>
            </td>
            <td style="text-align: center; font-weight: 600;">${d.cantidad}</td>
            <td style="text-align: right;">$${parseFloat(d.precio_unitario || 0).toFixed(2)}</td>
            <td style="text-align: right; font-weight: 700; color: var(--primary);">$${parseFloat(d.subtotal || 0).toFixed(2)}</td>
          </tr>
        `).join('');
      }

      // Renderizar Historial de Cobros
      if (listaCobros.length === 0) {
        tbodyCobros.innerHTML = `
          <tr>
            <td colspan="5" class="empty-state" style="padding: 1.5rem;">
              <p>No se han registrado pagos o abonos para esta factura aún.</p>
            </td>
          </tr>`;
      } else {
        tbodyCobros.innerHTML = listaCobros.map(c => `
          <tr>
            <td>${c.fecha_pago || 'N/A'}</td>
            <td><span class="ag-badge badge-info">${this.escaparHtml(c.metodo_pago || 'General')}</span></td>
            <td>${this.escaparHtml(c.referencia || '-')}</td>
            <td>${this.escaparHtml(c.comentario || '-')}</td>
            <td style="text-align: right; font-weight: 700; color: var(--success);">$${parseFloat(c.monto || 0).toFixed(2)}</td>
          </tr>
        `).join('');
      }

    } catch (err) {
      console.error('Error al cargar detalle de factura:', err);
      this.mostrarToast('Error', 'No se pudo cargar el detalle de la factura.', 'danger');
    }
  },

  cerrarModalDetalle() {
    const modal = document.getElementById('modal-detalle-factura');
    if (modal) modal.classList.add('d-none');
  },

  // ===================================================================
  // 7. KPIs GLOBALES Y MÉTRICAS
  // ===================================================================
  actualizarKPIs() {
    const kpiClientes = document.getElementById('kpi-clientes');
    const kpiArticulos = document.getElementById('kpi-articulos');
    const kpiFacturado = document.getElementById('kpi-facturado');
    const kpiPendiente = document.getElementById('kpi-pendiente');

    if (kpiClientes) kpiClientes.textContent = state.clientes.length;
    if (kpiArticulos) kpiArticulos.textContent = state.articulos.length;

    let totalFacturado = 0;
    let totalPendiente = 0;

    state.ventas.forEach(v => {
      const montoTotal = parseFloat(v.monto_total || 0);
      const cobrosArray = Array.isArray(v.cobros) ? v.cobros : [];
      const totalAbonado = cobrosArray.reduce((acc, c) => acc + parseFloat(c.monto || 0), 0);
      const saldo = Math.max(0, montoTotal - totalAbonado);

      totalFacturado += montoTotal;
      totalPendiente += saldo;
    });

    if (kpiFacturado) kpiFacturado.textContent = `$${totalFacturado.toFixed(2)}`;
    if (kpiPendiente) kpiPendiente.textContent = `$${totalPendiente.toFixed(2)}`;
  },

  // ===================================================================
  // 8. UTILIDADES Y NOTIFICACIONES TOAST
  // ===================================================================
  mostrarToast(titulo, mensaje, tipo = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-item toast-${tipo}`;

    let iconClass = 'fa-info-circle';
    if (tipo === 'success') iconClass = 'fa-circle-check';
    if (tipo === 'danger') iconClass = 'fa-triangle-exclamation';
    if (tipo === 'warning') iconClass = 'fa-circle-exclamation';

    toast.innerHTML = `
      <i class="fa-solid ${iconClass}" style="font-size: 1.25rem; margin-top: 2px;"></i>
      <div class="toast-content" style="flex: 1;">
        <h4>${this.escaparHtml(titulo)}</h4>
        <p>${this.escaparHtml(mensaje)}</p>
      </div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(40px)';
      setTimeout(() => toast.remove(), 300);
    }, 4200);
  },

  escaparHtml(cadena) {
    if (!cadena) return '';
    return String(cadena)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
};

// Exponer la app globalmente y arrancar al cargar el DOM
window.app = app;
document.addEventListener('DOMContentLoaded', () => {
  app.init();
});