/**
 * ============================================
 * APPLICATION ENTRY POINT
 * ============================================
 * Initializes the entire 5G SBA Dashboard application
 * 
 * Responsibilities:
 * - Load configuration files
 * - Initialize all managers in correct order
 * - Handle startup errors
 * - Provide global initialization
 */

/**
 * Main initialization function
 */
async function initializeApp() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🚀 5G SERVICE-BASED ARCHITECTURE DASHBOARD');
    console.log('═══════════════════════════════════════════════════════');
    console.log('Initializing...');

    try {
        // ==========================================
        // STEP 1: Load NF Definitions
        // ==========================================
        console.log('\n📄 Step 1: Loading NF definitions...');
        try {
            const response = await fetch('../nf-definitions.json');
            window.nfDefinitions = await response.json();
            console.log('✅ NF definitions loaded successfully');
            console.log('🔍 Sample NF definition (AMF):', window.nfDefinitions.AMF);
        } catch (error) {
            console.warn('⚠️ Could not load data/nf-definitions.json, using defaults');
            console.error('❌ Fetch error:', error);
            window.nfDefinitions = getDefaultNFDefinitions();
        }

        // ==========================================
        // STEP 2: Initialize Global HTTP Protocol
        // ==========================================
        window.globalHTTPProtocol = 'HTTP/2'; // Default protocol
        console.log('✅ Global HTTP Protocol set to:', window.globalHTTPProtocol);

        // ==========================================
        // STEP 3: Initialize Core Managers
        // ==========================================
        console.log('\n🔧 Step 3: Initializing core managers...');

        // Data Store (must be first)
        window.dataStore = new DataStore();

        // Log Engine (needs data store)
        window.logEngine = new LogEngine();

        // --- ADDED: NRF Registry (for NF Registration, Discovery, Deregistration) ---
        window.nrfRegistry = new NRFRegistry();

        // NF Manager
        window.nfManager = new NFManager();

        // Connection Manager
        window.connectionManager = new ConnectionManager();

        // Bus Manager (NEW)
        window.busManager = new BusManager();

        // Ping Manager (NEW)
        window.pingManager = new PingManager();

        // Canvas Renderer
        window.canvasRenderer = new CanvasRenderer();

        // UI Controller
        window.uiController = new UIController();

        console.log('✅ All managers initialized successfully');

        // ==========================================
        // STEP 4: Initialize UI
        // ==========================================
        console.log('\n🎨 Step 4: Initializing user interface...');
        window.uiController.init();
        console.log('✅ UI initialized');

        // ==========================================
        // STEP 5: Initial Render
        // ==========================================
        console.log('\n🖼️ Step 5: Rendering initial canvas...');
        window.canvasRenderer.render();
        console.log('✅ Canvas rendered');

        // ==========================================
        // STEP 6: Add Startup Log
        // ==========================================
        console.log('\n📋 Step 6: Adding startup log...');
        window.logEngine.addLog('system', 'SUCCESS',
            '5G SBA Dashboard initialized and ready', {
            version: '1.0.0',
            httpProtocol: window.globalHTTPProtocol,
            timestamp: new Date().toISOString(),

        });

        // ==========================================
        // SUCCESS
        // ==========================================
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('✅ DASHBOARD READY');
        console.log('═══════════════════════════════════════════════════════');


        console.log('📌 Default HTTP Protocol:', window.globalHTTPProtocol);
        console.log('📌 Click "Add NF" to start building your 5G network');
        console.log('📌 Click "Add Bus Line" to create service buses');
        console.log('📌 Use left sidebar to drag NFs onto canvas');
        console.log('📌 Connect NFs: Select Source → Select Destination → Click NF or Bus Line');
        console.log('🚌 Bus lines are CLICKABLE and work as message hubs!');
        console.log('❓ Click "Help" button or press F1 for 5G architecture guide');
        console.log('═══════════════════════════════════════════════════════\n');

        // // Show helpful instructions
        // setTimeout(() => {
        //     alert('🚌 BIDIRECTIONAL BUS SYSTEM:\n\n' +
        //           '✨ BUSES work as BOTH source & destination!\n\n' +
        //           'CONNECTION TYPES:\n' +
        //           '• NF → Bus: Select NF, then Bus\n' +
        //           '• Bus → NF: Select Bus, then NF\n' +
        //           '• Bus → Bus: Select Bus, then another Bus\n\n' +
        //           '🎯 SIMPLE WORKFLOW:\n' +
        //           '1. Click "Select Source" → Click anything\n' +
        //           '2. Click "Select Destination" → Click anything\n\n' +
        //           'Look for "● CLICKABLE" indicators on buses!');
        // }, 2000);

    } catch (error) {
        console.error('═══════════════════════════════════════════════════════');
        console.error('❌ INITIALIZATION FAILED');
        console.error('═══════════════════════════════════════════════════════');
        console.error('Error:', error);
        console.error('Stack:', error.stack);
        console.error('═══════════════════════════════════════════════════════');

        alert('Failed to initialize dashboard: ' + error.message);
    }
}

/**
 * Default NF definitions if JSON fails to load
 * @returns {Object} Default NF definitions
 */
function getDefaultNFDefinitions() {
    return {
        'NRF': {
            name: 'Network Repository Function',
            color: '#3498db',
            description: 'Central registry for NF discovery'
        },
        'AMF': {
            name: 'Access and Mobility Management Function',
            color: '#2ecc71',
            description: 'Handles mobility and access control'
        },
        'SMF': {
            name: 'Session Management Function',
            color: '#e74c3c',
            description: 'Manages user sessions and connectivity'
        },
        'UPF': {
            name: 'User Plane Function',
            color: '#f1c40f',
            description: 'Handles user data traffic'
        },
        'AUSF': {
            name: 'Authentication Server Function',
            color: '#9b59b6',
            description: 'Handles authentication'
        },
        'UDM': {
            name: 'Unified Data Management',
            color: '#e67e22',
            description: 'Manages user data and subscriptions'
        },
        'PCF': {
            name: 'Policy Control Function',
            color: '#16a085',
            description: 'Manages network policies'
        },
        'NSSF': {
            name: 'Network Slice Selection Function',
            color: '#34495e',
            description: 'Handles network slice selection'
        },
        'UDR': {
            name: 'Unified Data Repository',
            color: '#95a5a6',
            description: 'Exposes network capabilities'
        },
        'gNB': {
            name: 'Next Generation NodeB (5G Base Station)',
            color: '#8e44ad',
            description: '5G radio access network base station'
        },
        'UE': {
            name: 'User Equipment (Mobile Device)',
            color: '#16a085',
            description: 'End-user device connecting to 5G network'
        },
        'MySQL': {
            name: 'MySQL Database',
            color: '#d35400',
            description: 'Backend database for subscription data'
        }
    };
}

// Start the application when the page loads
document.addEventListener('DOMContentLoaded', initializeApp);