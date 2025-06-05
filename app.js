// Dashboard de Cargas - CON GMAIL
const express = require('express');
const path = require('path');
const { google } = require('googleapis');
const fs = require('fs').promises;

// Crear aplicación Express
const app = express();
const PORT = 3000;

// Configuración de vistas
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Archivos estáticos y middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Variables globales
let cargas = [];
let ultimaActualizacion = new Date();
let estadoConexion = 'desconectado';
let oAuth2Client = null;

// Configuración OAuth2
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const TOKEN_PATH = 'token.json';

// Cargar credenciales
async function cargarCredenciales() {
    try {
        const content = await fs.readFile('credentials.json');
        return JSON.parse(content);
    } catch (err) {
        console.error('❌ Error: No se encontró credentials.json');
        return null;
    }
}

// Autorizar
async function autorizar() {
    const credentials = await cargarCredenciales();
    if (!credentials) return null;

    const { client_secret, client_id, redirect_uris } = credentials.web || credentials.installed;
    oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    try {
        const token = await fs.readFile(TOKEN_PATH);
        oAuth2Client.setCredentials(JSON.parse(token));
        estadoConexion = 'conectado';
        console.log('✅ Conectado a Gmail');
        return oAuth2Client;
    } catch (err) {
        console.log('⚠️ Necesitas autorizar la aplicación');
        return null;
    }
}

// Buscar emails con cargas
async function buscarCargas(auth) {
    if (!auth) return [];
    
    const gmail = google.gmail({ version: 'v1', auth });
    
    try {
        // Buscar emails
        const res = await gmail.users.messages.list({
            userId: 'me',
            q: 'subject:"Carga dodedero"',
            maxResults: 20
        });

        const messages = res.data.messages || [];
        console.log(`📧 Encontrados ${messages.length} emails`);

        // Limpiar array
        cargas = [];

        // Obtener detalles de cada mensaje
        for (const message of messages) {
            try {
                const detalle = await gmail.users.messages.get({
                    userId: 'me',
                    id: message.id
                });

                const headers = detalle.data.payload.headers;
                const asunto = headers.find(h => h.name === 'Subject')?.value || '';
                const de = headers.find(h => h.name === 'From')?.value || '';
                const fecha = headers.find(h => h.name === 'Date')?.value || '';
                const para = headers.find(h => h.name === 'To')?.value || '';

                // Extraer número de carga
                const match = asunto.match(/Carga dodedero (\d+)/i);
                const numeroCarga = match ? match[1] : 'Sin número';

                cargas.push({
                    id: message.id,
                    numeroCarga: numeroCarga,
                    empleado: para,
                    de: de,
                    fecha: new Date(fecha),
                    fechaFormateada: new Date(fecha).toLocaleString('es-AR'),
                    asunto: asunto
                });
            } catch (error) {
                console.error('Error procesando mensaje:', error);
            }
        }

        // Ordenar por fecha
        cargas.sort((a, b) => b.fecha - a.fecha);
        ultimaActualizacion = new Date();
        
        return cargas;
    } catch (error) {
        console.error('❌ Error buscando emails:', error.message);
        return [];
    }
}

// RUTAS

// Ruta principal
app.get('/', async (req, res) => {
    res.render('dashboard', {
        cargas: cargas,
        ultimaActualizacion: ultimaActualizacion.toLocaleString('es-AR'),
        estadoConexion: estadoConexion,
        totalCargas: cargas.length
    });
});

// Ruta para iniciar autorización
app.get('/auth', async (req, res) => {
    const credentials = await cargarCredenciales();
    if (!credentials) {
        return res.send('Error: No se encontró credentials.json');
    }

    const { client_secret, client_id, redirect_uris } = credentials.web || credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });

    res.send(`
        <html>
        <body style="font-family: Arial; padding: 20px;">
            <h1>🔐 Autorizar Dashboard de Cargas</h1>
            <p>Para conectar con Gmail, necesitas autorizar la aplicación:</p>
            <ol>
                <li>Hacé click en el siguiente link</li>
                <li>Logueate con tu Gmail</li>
                <li>Aceptá los permisos</li>
                <li>Copiá el código que te da Google</li>
                <li>Volvé acá y pegalo</li>
            </ol>
            <a href="${authUrl}" target="_blank" style="background: #4285f4; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 20px 0;">
                Autorizar con Google
            </a>
            <br><br>
            <form action="/auth/callback" method="POST">
                <label>Código de autorización:</label><br>
                <input type="text" name="code" style="width: 400px; padding: 5px;" required><br><br>
                <button type="submit" style="background: #34a853; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">
                    Enviar código
                </button>
            </form>
        </body>
        </html>
    `);
});

// Callback de autorización
app.post('/auth/callback', async (req, res) => {
    const { code } = req.body;
    
    try {
        const credentials = await cargarCredenciales();
        const { client_secret, client_id, redirect_uris } = credentials.web || credentials.installed;
        const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
        
        const { tokens } = await oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(tokens);
        
        // Guardar token
        await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens));
        
        estadoConexion = 'conectado';
        console.log('✅ Autorización exitosa');
        
        res.send(`
            <html>
            <body style="font-family: Arial; padding: 20px; text-align: center;">
                <h1>✅ ¡Autorización exitosa!</h1>
                <p>Ya podés volver al dashboard</p>
                <a href="/" style="background: #34a853; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 20px;">
                    Ir al Dashboard
                </a>
            </body>
            </html>
        `);
        
        // Buscar cargas inmediatamente
        await actualizarCargas();
    } catch (error) {
        console.error('Error:', error);
        res.send('Error: ' + error.message);
    }
});

// API para obtener cargas
app.get('/api/cargas', (req, res) => {
    res.json({
        cargas: cargas,
        ultimaActualizacion: ultimaActualizacion,
        estadoConexion: estadoConexion,
        totalCargas: cargas.length
    });
});

// Actualizar cargas
async function actualizarCargas() {
    console.log('🔄 Actualizando cargas...');
    const auth = await autorizar();
    if (auth) {
        await buscarCargas(auth);
        console.log(`✅ ${cargas.length} cargas encontradas`);
    }
}

// Actualizar cada 5 minutos
setInterval(actualizarCargas, 5 * 60 * 1000);

// Iniciar servidor
app.listen(PORT, async () => {
    console.log(`
╔══════════════════════════════════════════╗
║      Dashboard de Cargas con Gmail       ║
╠══════════════════════════════════════════╣
║  🌐 URL: http://localhost:${PORT}            ║
║  📅 Fecha: ${new Date().toLocaleString('es-AR')}
║  ⚙️ Estado: Iniciando...                 ║
╚══════════════════════════════════════════╝
    `);
    
    // Intentar autorizar al inicio
    const auth = await autorizar();
    if (!auth) {
        console.log('\n⚠️ IMPORTANTE: Necesitas autorizar la app');
        console.log('👉 Abrí http://localhost:3000/auth en tu navegador\n');
    } else {
        await actualizarCargas();
    }
});

// Cerrar correctamente
process.on('SIGINT', () => {
    console.log('\n👋 Cerrando servidor...');
    process.exit(0);
});