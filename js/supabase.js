/**
 * =====================================================================
 * ZARELA CLINK - Sistema de Facturación y Cuentas por Cobrar
 * Archivo: js/supabase.js
 * Descripción: Configuración e inicialización del cliente Supabase JS v2
 * =====================================================================
 */

// URL del proyecto Supabase y Llave Pública Anon
const SUPABASE_RAW_URL = 'https://aozqbxivtuobxfltdjvd.supabase.co/rest/v1/';
// El SDK de Supabase espera la URL base del proyecto sin la ruta '/rest/v1/'
const SUPABASE_URL = SUPABASE_RAW_URL.replace(/\/rest\/v1\/?$/, '');
const SUPABASE_ANON_KEY = 'sb_publishable_WWpqRY3B2jfZRYxCHW7I2A_tWWPIQqU';

// Validar que el SDK de Supabase esté presente en la ventana global
if (typeof window.supabase === 'undefined') {
    console.error('❌ Error: El SDK de Supabase no fue detectado. Asegúrate de incluir el CDN en index.html');
}

// Inicialización de la conexión con Supabase v2
const supabaseClient = window.supabase
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: false,
            autoRefreshToken: false
        }
    })
    : null;

// Exponer la instancia de Supabase de manera accesible globalmente
window.supabaseClient = supabaseClient;
window.db = supabaseClient;

console.log('✅ Cliente Supabase inicializado correctamente para Zarela Clink:', SUPABASE_URL);
