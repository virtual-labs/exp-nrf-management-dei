/***
 * ============================================
 * DOCKER TERMINAL MANAGER
 * ============================================
 * Manages Docker terminal functionality for managing Network Functions
 * 
 * Responsibilities:
 * - Docker compose commands (up, down, ps)
 * - Start/stop individual NFs
 * - Display service status with health indicators
 * - Watch mode for real-time status updates
 */

class DockerTerminal {
    constructor() {
        this.watchInterval = null;
        this.isWatching = false;
        this.dockerServices = new Map(); // Map of service name to status

        // Terminal window state
        this.terminalState = {
            x: null,
            y: null,
            width: 900,
            height: 700,
            isMaximized: false,
            isMinimized: false
        };

        // Network state
        this.oaiWorkshopNetworkExists = false;
        this.oaiWorkshopNetworkId = this.generateNetworkId();
        this.oaiWorkshopCreatedTime = null;

        // Cache for one-click.json topology
        this.oneClickTopology = null;
        this.topologyLoadPromise = null;

        console.log('✅ DockerTerminal initialized');
    }

    /**
     * Initialize Docker terminal button
     */
    init() {
        // Button is added in HTML, just setup click handler if needed
        console.log('✅ Docker terminal ready');
    }

    /**
     * Load one-click.json topology (cached)
     * @returns {Promise<Object>} Topology object
     */
    async loadOneClickTopology() {
        // Return cached topology if available
        if (this.oneClickTopology) {
            return this.oneClickTopology;
        }

        // If already loading, return the existing promise
        if (this.topologyLoadPromise) {
            return this.topologyLoadPromise;
        }

        // Start loading
        this.topologyLoadPromise = (async () => {
            try {
                const response = await fetch('../one-click.json');
                if (!response.ok) {
                    throw new Error(`Failed to load one-click.json: ${response.statusText}`);
                }
                this.oneClickTopology = await response.json();
                console.log('✅ Loaded one-click.json topology');
                return this.oneClickTopology;
            } catch (error) {
                console.warn('⚠️ Could not load one-click.json:', error);
                this.oneClickTopology = null;
                return null;
            } finally {
                this.topologyLoadPromise = null;
            }
        })();

        return this.topologyLoadPromise;
    }

    /**
     * Get position for NF type from one-click.json
     * @param {string} nfType - NF type (e.g., 'NRF', 'AMF')
     * @returns {Object|null} Position {x, y} or null if not found
     */
    async getPositionFromOneClick(nfType) {
        const topology = await this.loadOneClickTopology();
        if (!topology || !topology.nfs) {
            return null;
        }

        const nf = topology.nfs.find(n => n.type === nfType);
        if (nf && nf.position) {
            return { x: nf.position.x, y: nf.position.y };
        }

        return null;
    }

    /**
     * Auto-connect NF to buses based on one-click.json
     * @param {Object} nf - Network Function object
     */
    async autoConnectToBusesFromOneClick(nf) {
        if (!nf || !window.busManager || !window.dataStore) {
            return;
        }

        const topology = await this.loadOneClickTopology();
        if (!topology || !topology.buses || !topology.busConnections) {
            return;
        }

        // Find bus connections for this NF type in one-click.json
        const nfFromTopology = topology.nfs.find(n => n.type === nf.type);
        if (!nfFromTopology) {
            return;
        }

        // Find all bus connections for this NF in topology
        const busConnections = topology.busConnections.filter(bc => {
            // Match by NF type (since IDs will be different)
            const connectedNF = topology.nfs.find(n => n.id === bc.nfId);
            return connectedNF && connectedNF.type === nf.type;
        });

        // Connect to each bus
        for (const busConn of busConnections) {
            const busFromTopology = topology.buses.find(b => b.id === busConn.busId);
            if (!busFromTopology) {
                continue;
            }

            // Find or create the bus in current dataStore
            let bus = window.dataStore.getAllBuses().find(b => b.name === busFromTopology.name);
            
            // If bus doesn't exist, create it from one-click.json
            if (!bus && window.busManager) {
                bus = window.busManager.createBusLine(
                    busFromTopology.orientation || 'horizontal',
                    busFromTopology.position || null,
                    busFromTopology.length || 600,
                    busFromTopology.name
                );
                
                if (bus) {
                    // Set bus color if available
                    if (busFromTopology.color) {
                        bus.color = busFromTopology.color;
                    }
                    console.log(`🚌 Created bus ${bus.name} from one-click.json`);
                }
            }

            if (bus) {
                // Check if already connected
                const existingConnection = window.dataStore.getAllBusConnections().find(
                    bc => bc.nfId === nf.id && bc.busId === bus.id
                );
                
                if (!existingConnection) {
                    // Connect NF to bus
                    const connection = window.busManager.connectNFToBus(nf.id, bus.id);
                    if (connection) {
                        console.log(`🔗 Auto-connected ${nf.name} to ${bus.name} (from one-click.json)`);
                        
                        if (window.logEngine) {
                            window.logEngine.addLog(nf.id, 'INFO', 
                                `Auto-connected to ${bus.name} service bus (from one-click.json)`, {
                                busId: bus.id,
                                interfaceName: connection.interfaceName,
                                autoConnect: true
                            });
                        }
                    }
                }
            }
        }
    }

    /**
     * Open Docker terminal modal
     */
    openTerminal() {
        // Remove existing terminal if any
        const existingTerminal = document.getElementById('docker-terminal-modal');
        if (existingTerminal) {
            existingTerminal.remove();
        }

        // Create terminal modal
        const terminalModal = document.createElement('div');
        terminalModal.id = 'docker-terminal-modal';
        terminalModal.className = 'docker-terminal-modal';
        terminalModal.innerHTML = `
            <div class="docker-terminal-window" id="docker-terminal-window">
                <div class="docker-terminal-titlebar" id="docker-terminal-titlebar">
                    <div class="docker-terminal-title">
                        <span class="docker-terminal-icon">🐳</span>
                        Docker Terminal - Main Terminal
                    </div>
                    <div class="docker-terminal-controls">
                        <button class="docker-terminal-btn minimize" id="docker-terminal-minimize" title="Minimize">−</button>
                        <button class="docker-terminal-btn maximize" id="docker-terminal-maximize" title="Maximize">□</button>
                        <button class="docker-terminal-btn close" id="docker-terminal-close" title="Close">×</button>
                    </div>
                </div>
                <div class="docker-terminal-content" id="docker-terminal-content">
                    <div class="docker-terminal-header">
                        Docker Terminal v1.0<br>
                        Type 'help' for available commands<br><br>
                    </div>
                    <div class="docker-terminal-output" id="docker-terminal-output"></div>
                    <div class="docker-terminal-input-line">
                        <span class="docker-terminal-prompt">docker@main></span>
                        <input type="text" id="docker-terminal-input" class="docker-terminal-input" autocomplete="off" spellcheck="false">
                    </div>
                </div>
                <div class="docker-terminal-resize-handle" id="docker-terminal-resize-handle"></div>
            </div>
        `;

        document.body.appendChild(terminalModal);

        // Setup terminal functionality
        this.setupTerminal(terminalModal);

        // Setup dragging, resizing, and window controls
        this.setupWindowControls(terminalModal);

        // Apply saved position and size
        this.applyTerminalState();

        // Show terminal with animation
        setTimeout(() => {
            terminalModal.classList.add('show');
        }, 10);

        // Focus on input
        const input = document.getElementById('docker-terminal-input');
        if (input) {
            input.focus();
        }
    }

    /**
     * Setup Docker terminal functionality
     * @param {HTMLElement} terminalModal - Terminal modal element
     */
    setupTerminal(terminalModal) {
        const input = document.getElementById('docker-terminal-input');
        const output = document.getElementById('docker-terminal-output');
        const closeBtn = document.getElementById('docker-terminal-close');

        let commandHistory = [];
        let historyIndex = -1;

        // Close button
        closeBtn.addEventListener('click', () => {
            this.stopWatch();
            terminalModal.classList.remove('show');
            setTimeout(() => {
                terminalModal.remove();
            }, 300);
        });

        // Click outside to close
        terminalModal.addEventListener('click', (e) => {
            if (e.target === terminalModal) {
                closeBtn.click();
            }
        });

        // Input handling
        input.addEventListener('keydown', async (e) => {
            // Handle Ctrl+C to stop watch mode
            if (e.ctrlKey && e.key === 'c' && this.isWatching) {
                e.preventDefault();
                this.stopWatch();
                this.addTerminalLine(output, '', 'blank');
                this.addTerminalLine(output, 'Watch mode stopped.', 'info');
                this.addTerminalLine(output, '', 'blank');
                return;
            }

            if (e.key === 'Enter') {
                const command = input.value.trim();
                if (command) {
                    // Add to history
                    commandHistory.push(command);
                    historyIndex = commandHistory.length;

                    // Display command
                    this.addTerminalLine(output, `docker@main>${command}`, 'command');

                    // Clear input
                    input.value = '';

                    // Process command
                    await this.processCommand(command, output);
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (historyIndex > 0) {
                    historyIndex--;
                    input.value = commandHistory[historyIndex];
                }
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (historyIndex < commandHistory.length - 1) {
                    historyIndex++;
                    input.value = commandHistory[historyIndex];
                } else {
                    historyIndex = commandHistory.length;
                    input.value = '';
                }
            }
        });

        // Initial welcome message
        this.addTerminalLine(output, 'Welcome to Docker Terminal', 'info');
        this.addTerminalLine(output, 'Type "help" for available commands.', 'info');
        this.addTerminalLine(output, '', 'blank');
    }

    /**
     * Process Docker command
     * @param {string} command - Command to process
     * @param {HTMLElement} output - Output element
     */
    async processCommand(command, output) {
        const cmd = command.toLowerCase().trim();
        const args = command.split(' ');

        if (cmd === 'help' || cmd === '?') {
            this.showHelp(output);
        } else if (cmd === 'status' || cmd === 'check') {
            this.checkSystemStatus(output);
        } else if (cmd === 'docker compose -f docker-compose.yml up -d' || cmd === 'docker-compose -f docker-compose.yml up -d' ||
                   cmd === 'docker compose up -d' ||
                   cmd === 'docker-compose up -d') {
            await this.dockerComposeUp(output);
        } else if (cmd === 'docker compose -f docker-compose-gnb.yml up -d' || 
                   cmd === 'docker-compose -f docker-compose-gnb.yml up -d') {
            await this.dockerComposeGnbUp(output);
        } else if (cmd === 'docker compose -f docker-compose-ue.yml up -d' || 
                   cmd === 'docker-compose -f docker-compose-ue.yml up -d') {
            await this.dockerComposeUeUp(output);
        } else if (cmd === 'docker compose -f docker-compose-ran.yml up -d oai-ue1' || 
                   cmd === 'docker-compose -f docker-compose-ran.yml up -d oai-ue1') {
            await this.dockerComposeUe1Up(output);
        } else if (cmd === 'docker compose -f docker-compose-ran.yml up -d oai-ue2' || 
                   cmd === 'docker-compose -f docker-compose-ran.yml up -d oai-ue2') {
            await this.dockerComposeUe2Up(output);
        } else if (cmd === 'docker ps') {
            await this.dockerPS(output);
        } else if (cmd === 'docker network ls') {
            this.dockerNetworkLS(output);
        } else if (cmd.startsWith('docker network inspect ')) {
            const networkName = args.slice(3).join(' ');
            this.dockerNetworkInspect(networkName, output);
        } else if (cmd === 'docker version') {
            this.dockerVersion(output);
        } else if (cmd.startsWith('watch docker compose -f docker-compose.yml ps -a') ||
                   cmd.startsWith('watch docker-compose -f docker-compose.yml ps -a') ||
                   cmd.startsWith('watch docker compose ps -a')) {
            this.startWatch(output);
        } else if (cmd === 'docker compose -f docker-compose.yml down' ||
                   cmd === 'docker-compose -f docker-compose.yml down' ||
                   cmd === 'docker compose down' ||
                   cmd === 'docker-compose down') {
            await this.dockerComposeDown(output);
         } else if (cmd.startsWith('docker compose -f docker-compose.yml up -d ') ||
                 cmd.startsWith('docker-compose -f docker-compose.yml up -d ') ||
                 cmd.startsWith('docker compose up -d ') ||
                 cmd.startsWith('docker-compose up -d ')) {
             const parts = command.split(' ').filter(Boolean);
             const serviceName = parts[parts.length - 1];
             await this.dockerComposeServiceUp(serviceName, output);
         } else if (cmd.startsWith('docker compose -f docker-compose.yml down ') ||
                 cmd.startsWith('docker-compose -f docker-compose.yml down ') ||
                 cmd.startsWith('docker compose down ') ||
                 cmd.startsWith('docker-compose down ')) {
             const parts = command.split(' ').filter(Boolean);
             const serviceName = parts[parts.length - 1];
             await this.dockerComposeServiceDown(serviceName, output);
        } else if (cmd === 'docker compose -f docker-compose-gnb.yml down' ||
                   cmd === 'docker-compose -f docker-compose-gnb.yml down') {
            await this.dockerComposeGnbDown(output);
        } else if (cmd === 'docker compose -f docker-compose-ue.yml down' ||
                   cmd === 'docker-compose -f docker-compose-ue.yml down') {
            await this.dockerComposeUeDown(output);
        } else if (cmd.startsWith('docker start ')) {
            const serviceName = args.slice(2).join(' ');
            await this.dockerStart(serviceName, output);
        } else if (cmd.startsWith('docker stop ')) {
            const serviceName = args.slice(2).join(' ');
            await this.dockerStop(serviceName, output);
        } else if (cmd === 'cls' || cmd === 'clear') {
            output.innerHTML = '';
        } else if (cmd === 'exit') {
            const closeBtn = document.getElementById('docker-terminal-close');
            if (closeBtn) closeBtn.click();
        } else {
            this.addTerminalLine(output, `Command not found: ${command}`, 'error');
            this.addTerminalLine(output, 'Type "help" for available commands.', 'info');
        }

        this.addTerminalLine(output, '', 'blank');
    }

    /**
     * Check system status
     * @param {HTMLElement} output - Output element
     */
    checkSystemStatus(output) {
        this.addTerminalLine(output, 'System Status Check:', 'info');
        this.addTerminalLine(output, '', 'blank');

        // Check dataStore
        if (window.dataStore) {
            this.addTerminalLine(output, '✅ DataStore: Available', 'success');
            const allNFs = window.dataStore.getAllNFs() || [];
            this.addTerminalLine(output, `   Found ${allNFs.length} Network Function(s)`, 'info');

            if (allNFs.length > 0) {
                this.addTerminalLine(output, '', 'blank');
                this.addTerminalLine(output, 'Network Functions:', 'info');
                allNFs.forEach(nf => {
                    const status = nf.status || 'unknown';
                    const statusColor = status === 'stable' ? 'success' : (status === 'starting' ? 'warning' : 'info');
                    this.addTerminalLine(output, `  - ${nf.name} (${nf.type}): ${status}`, statusColor);
                });
            }
        } else {
            this.addTerminalLine(output, '❌ DataStore: Not available', 'error');
        }

        this.addTerminalLine(output, '', 'blank');

        // Check other managers
        if (window.nfManager) {
            this.addTerminalLine(output, '✅ NFManager: Available', 'success');
        } else {
            this.addTerminalLine(output, '❌ NFManager: Not available', 'error');
        }

        if (window.canvasRenderer) {
            this.addTerminalLine(output, '✅ CanvasRenderer: Available', 'success');
        } else {
            this.addTerminalLine(output, '❌ CanvasRenderer: Not available', 'error');
        }
    }

    /**
     * Show help
     * @param {HTMLElement} output - Output element
     */
    showHelp(output) {
        const helpText = [
            'Available Docker Commands:',
            '',
            '  docker compose -f docker-compose.yml up -d',
            '    Start all Core Network Functions (one-click deployment)',
            '',
            '  docker compose -f docker-compose-gnb.yml up -d',
            '    Start gNB (gNodeB) container',
            '',
            '  docker compose -f docker-compose-ue.yml up -d',
            '    Start both UE containers (oai-ue1 and oai-ue2)',
            '',
            '  docker compose -f docker-compose-ran.yml up -d oai-ue1',
            '    Start only UE1 container',
            '',
            '  docker compose -f docker-compose-ran.yml up -d oai-ue2',
            '    Start only UE2 container',
            '',
            '  docker ps',
            '    Show running Docker containers',
            '',
            '  docker network ls',
            '    List all Docker networks',
            '',
            '  docker network inspect <network-name>',
            '    Inspect a specific Docker network (bridge, host, none, oaiworkshop)',
            '',
            '  docker version',
            '    Show Docker version information',
            '',
            '  watch docker compose -f docker-compose.yml ps -a',
            '    Watch service status with auto-refresh (every 1 second)',
            '',
            '  docker compose -f docker-compose.yml down',
            '    Stop and remove all core network services',
            '',
            '  docker compose -f docker-compose-gnb.yml down',
            '    Stop and remove gNB container',
            '',
            '  docker compose -f docker-compose-ue.yml down',
            '    Stop and remove all UE containers',
            '',
            '  docker start <service-name>',
            '    Start a specific Network Function',
            '',
            '  docker stop <service-name>',
            '    Stop a specific Network Function',
            '',
            '  cls / clear',
            '    Clear the terminal screen',
            '',
            '  status / check',
            '    Check system status and list available NFs',
            '',
            '  exit',
            '    Close the terminal',
            ''
        ];

        helpText.forEach(line => {
            this.addTerminalLine(output, line, 'info');
        });
    }

    /**
     * Execute docker compose up -d (start all NFs)
     * @param {HTMLElement} output - Output element
     */
    async dockerComposeUp(output) {
        // Check if dataStore is available
        if (!window.dataStore) {
            this.addTerminalLine(output, 'Error: DataStore not initialized. Please refresh the page.', 'error');
            console.error('❌ DataStore not available');
            return;
        }

        // Check if NFManager is available
        if (!window.nfManager) {
            this.addTerminalLine(output, 'Error: NFManager not initialized. Please refresh the page.', 'error');
            console.error('❌ NFManager not available');
            return;
        }

        // Get existing NFs from data store (exclude gNB and UE for core network deployment)
        let existingNFs = window.dataStore.getAllNFs() || [];
        existingNFs = existingNFs.filter(nf => nf.type !== 'gNB' && nf.type !== 'UE');

        // Load topology from one-click.json to get expected NFs
        let topology = null;
        try {
            topology = await this.loadOneClickTopology();
            if (!topology) {
                throw new Error('Failed to load one-click.json');
            }
        } catch (error) {
            this.addTerminalLine(output, `❌ Failed to load topology: ${error.message}`, 'error');
            this.addTerminalLine(output, 'Falling back to default NF creation...', 'warning');
            this.addTerminalLine(output, '', 'blank');

            // Fallback to default NFs if topology file fails
            await this.createDefaultNFs(output);
            existingNFs = window.dataStore.getAllNFs();
            existingNFs = existingNFs.filter(nf => nf.type !== 'gNB' && nf.type !== 'UE');
        }

        // Filter topology to exclude gNB and UE
        const filteredTopology = topology ? this.filterTopology(topology) : null;
        const expectedNFs = filteredTopology?.nfs || [];

        // Find which NFs are missing (need to be created)
        const existingNFTypes = new Set(existingNFs.map(nf => nf.type));
        const missingNFs = expectedNFs.filter(nf => !existingNFTypes.has(nf.type));

        // Create buses from one-click.json if they don't exist
        if (filteredTopology && filteredTopology.buses && window.busManager) {
            const existingBuses = window.dataStore.getAllBuses() || [];
            for (const busTemplate of filteredTopology.buses) {
                const busExists = existingBuses.find(b => b.name === busTemplate.name);
                if (!busExists) {
                    const bus = window.busManager.createBusLine(
                        busTemplate.orientation || 'horizontal',
                        busTemplate.position || null,
                        busTemplate.length || 600,
                        busTemplate.name
                    );
                    if (bus && busTemplate.color) {
                        bus.color = busTemplate.color;
                        // Bus is already added to dataStore by createBusLine, just update it
                        const updatedBus = window.dataStore.getBusById(bus.id);
                        if (updatedBus) {
                            updatedBus.color = busTemplate.color;
                        }
                    }
                }
            }
        }

        // Create missing NFs with positions from one-click.json
        const nfsToStart = [];
        
        if (missingNFs.length > 0) {
            // Import missing NFs
            const importTime = Date.now();
            for (const nfTemplate of missingNFs) {
                // Use position from one-click.json
                const position = nfTemplate.position || { x: 100, y: 100 };
                
                // Create NF using NFManager
                const nf = window.nfManager.createNetworkFunction(nfTemplate.type, position);
                if (nf) {
                    // Copy config from template
                    if (nfTemplate.config) {
                        nf.config = { ...nf.config, ...nfTemplate.config };
                    }
                    nf.createdAt = importTime;
                    nf.status = 'starting';
                    nf.statusTimestamp = Date.now();
                    
                    // Load icon if available
                    if (nfTemplate.icon) {
                        const img = new Image();
                        img.onload = () => {
                            nf.iconImage = img;
                            if (window.canvasRenderer) {
                                window.canvasRenderer.render();
                            }
                        };
                        img.onerror = () => {
                            console.warn(`Failed to load icon for ${nf.name}: ${nfTemplate.icon}`);
                        };
                        img.src = nfTemplate.icon;
                    }
                    
                    window.dataStore.updateNF(nf.id, nf);
                    
                    // Auto-connect to buses from one-click.json
                    await this.autoConnectToBusesFromOneClick(nf);
                    
                    // Trigger log engine
                    if (window.logEngine) {
                        window.logEngine.onNFAdded(nf);
                    }
                    
                    nfsToStart.push(nf);
                }
            }
        }

        // Get all NFs again (including newly created ones)
        let allNFs = window.dataStore.getAllNFs();
        allNFs = allNFs.filter(nf => nf.type !== 'gNB' && nf.type !== 'UE');

        // Calculate counts
        const totalNFs = allNFs.length;
        const alreadyRunning = existingNFs.length;
        const newlyCreated = nfsToStart.length;
        const networkCount = this.oaiWorkshopNetworkExists ? 0 : 1;
        const totalOperations = networkCount + newlyCreated;

        // Show Docker Compose style output
        if (totalOperations > 0) {
            this.addTerminalLine(output, `[+] Running ${totalOperations}/${totalOperations}`, 'info');
        } else {
            this.addTerminalLine(output, `[+] Running 0/0`, 'info');
            this.addTerminalLine(output, '', 'blank');
            this.addTerminalLine(output, 'All services are already running.', 'info');
            return;
        }

        // Create network if it doesn't exist
        if (!this.oaiWorkshopNetworkExists) {
            this.addTerminalLine(output, ' ✔ Network oaiworkshop Created' + ' '.repeat(20) + '0.2s', 'success');
            this.oaiWorkshopNetworkExists = true;
            this.oaiWorkshopCreatedTime = Date.now();
            await this.delay(200);
        }

        // Start only newly created NFs (skip already running ones)
        for (const nf of nfsToStart) {
            // Skip gNB and UE - they have separate compose files
            if (nf.type === 'gNB' || nf.type === 'UE') {
                continue;
            }

            // Get fresh NF from dataStore to ensure we have the latest
            const freshNF = window.dataStore.getNFById(nf.id);
            if (!freshNF) {
                continue;
            }

            // Store creation timestamp if not already set
            if (!freshNF.createdAt) {
                freshNF.createdAt = Date.now();
            }

            // Get service name
            const serviceNameMap = {
                'AMF': 'oai-amf', 'SMF': 'oai-smf', 'UPF': 'oai-upf', 'AUSF': 'oai-ausf',
                'UDM': 'oai-udm', 'UDR': 'oai-udr', 'NRF': 'oai-nrf', 'PCF': 'oai-pcf',
                'NSSF': 'oai-nssf', 'MySQL': 'mysql', 'ext-dn': 'oai-ext-dn'
            };
            const serviceName = serviceNameMap[freshNF.type] || freshNF.type.toLowerCase();

            // Show container creation with timing (random between 0.8s and 2.3s)
            const randomDelay = (Math.random() * 1.5 + 0.8).toFixed(1); // 0.8s to 2.3s
            this.addTerminalLine(output, ` ✔ Container ${serviceName.padEnd(16)} Started${' '.repeat(20)}${randomDelay}s`, 'success');
            await this.delay(parseFloat(randomDelay) * 1000); // Convert to milliseconds

            // Set status to starting (preserve createdAt)
            freshNF.status = 'starting';
            freshNF.statusTimestamp = Date.now();

            // Ensure createdAt is preserved
            if (!freshNF.createdAt) {
                freshNF.createdAt = Date.now();
            }

            window.dataStore.updateNF(freshNF.id, freshNF);

            // Generate startup log
            if (window.logEngine) {
                window.logEngine.addLog(freshNF.id, 'INFO', `${freshNF.name} starting via docker compose`, {
                    ipAddress: freshNF.config.ipAddress,
                    port: freshNF.config.port,
                    protocol: freshNF.config.httpProtocol,
                    status: 'starting',
                    source: 'docker-compose'
                });
            }

            // After 5 seconds, set to stable
            setTimeout(() => {
                const updatedNF = window.dataStore?.getNFById(freshNF.id);
                if (updatedNF) {
                    updatedNF.status = 'stable';
                    updatedNF.statusTimestamp = Date.now();

                    // Preserve createdAt timestamp
                    if (!updatedNF.createdAt && freshNF.createdAt) {
                        updatedNF.createdAt = freshNF.createdAt;
                    }

                    window.dataStore.updateNF(updatedNF.id, updatedNF);

                    // Generate stable log
                    if (window.logEngine) {
                        window.logEngine.addLog(updatedNF.id, 'SUCCESS', `${updatedNF.name} is now STABLE and ready for connections`, {
                            previousStatus: 'starting',
                            newStatus: 'stable',
                            uptime: '5 seconds',
                            readyForConnections: true
                        });
                    }

                    if (window.canvasRenderer) {
                        window.canvasRenderer.render();
                    }
                }
            }, 5000);
        }

        this.addTerminalLine(output, '', 'blank');

        // Re-render canvas
        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }
    }

    /**
     * Execute docker compose -f docker-compose-gnb.yml up -d (start gNB)
     * @param {HTMLElement} output - Output element
     */
    async dockerComposeGnbUp(output) {
        this.addTerminalLine(output, 'WARN[0000] No services to build', 'warning');
        this.addTerminalLine(output, 'WARN[0000] Found orphan containers ([oai-upf oai-smf oai-amf oai-ausf oai-udm oai-udr mysql oai-nrf oai-ext-dn]) for this project. If you removed or renamed this service in your compose file, you can run this command with the --remove-orphans flag to clean it up.', 'warning');
        this.addTerminalLine(output, '[+] up 1/1', 'info');

        // Check if gNB already exists
        const allNFs = window.dataStore?.getAllNFs() || [];
        let gnb = allNFs.find(nf => nf.type === 'gNB');

        if (!gnb && window.nfManager) {
            // Create gNB if it doesn't exist
            const position = window.nfManager.calculateAutoPosition('gNB', 1);
            gnb = window.nfManager.createNetworkFunction('gNB', position);
            
            if (gnb) {
                gnb.createdAt = Date.now();
                gnb.status = 'starting';
                gnb.statusTimestamp = Date.now();
                window.dataStore.updateNF(gnb.id, gnb);
            }
        }

        const randomDelay = (Math.random() * 0.3 + 0.1).toFixed(1);
        this.addTerminalLine(output, `✔ Container oai-gnb Created${' '.repeat(20)}${randomDelay}s`, 'success');
        await this.delay(parseFloat(randomDelay) * 1000);

        if (gnb) {
            // Set to stable after 5 seconds
            setTimeout(() => {
                const updatedGnb = window.dataStore?.getNFById(gnb.id);
                if (updatedGnb) {
                    updatedGnb.status = 'stable';
                    updatedGnb.statusTimestamp = Date.now();
                    window.dataStore.updateNF(updatedGnb.id, updatedGnb);

                    if (window.logEngine) {
                        window.logEngine.addLog(updatedGnb.id, 'SUCCESS', `${updatedGnb.name} is now STABLE and ready`, {
                            previousStatus: 'starting',
                            newStatus: 'stable',
                            uptime: '5 seconds'
                        });
                    }

                    if (window.canvasRenderer) {
                        window.canvasRenderer.render();
                    }
                }
            }, 5000);
        }

        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }
    }

    /**
     * Execute docker compose -f docker-compose-ue.yml up -d (start both UEs)
     * @param {HTMLElement} output - Output element
     */
    async dockerComposeUeUp(output) {
        this.addTerminalLine(output, 'WARN[0000] No services to build', 'warning');
        this.addTerminalLine(output, 'WARN[0000] Found orphan containers ([oai-upf oai-smf oai-amf oai-ausf oai-udm oai-udr mysql oai-nrf oai-ext-dn]) for this project. If you removed or renamed this service in your compose file, you can run this command with the --remove-orphans flag to clean it up.', 'warning');
        this.addTerminalLine(output, '[+] up 2/2', 'info');

        const allNFs = window.dataStore?.getAllNFs() || [];
        const ueTypes = ['UE', 'UE']; // Two UEs
        const ueNames = ['oai-ue1', 'oai-ue2'];
        const createdUEs = [];

        for (let i = 0; i < 2; i++) {
            let ue = allNFs.find(nf => nf.type === 'UE' && nf.name === `UE-${i + 1}`);

            if (!ue && window.nfManager) {
                const position = window.nfManager.calculateAutoPosition('UE', i + 1);
                ue = window.nfManager.createNetworkFunction('UE', position);
                
                if (ue) {
                    ue.name = `UE-${i + 1}`;
                    ue.createdAt = Date.now();
                    ue.status = 'starting';
                    ue.statusTimestamp = Date.now();
                    window.dataStore.updateNF(ue.id, ue);
                    createdUEs.push(ue);
                }
            } else if (ue) {
                createdUEs.push(ue);
            }

            const randomDelay = (Math.random() * 0.2 + 0.1).toFixed(1);
            this.addTerminalLine(output, `✔ Container ${ueNames[i]} Created${' '.repeat(20)}${randomDelay}s`, 'success');
            await this.delay(parseFloat(randomDelay) * 1000);
        }

        // Set UEs to stable after 5 seconds
        createdUEs.forEach(ue => {
            setTimeout(() => {
                const updatedUe = window.dataStore?.getNFById(ue.id);
                if (updatedUe) {
                    updatedUe.status = 'stable';
                    updatedUe.statusTimestamp = Date.now();
                    window.dataStore.updateNF(updatedUe.id, updatedUe);

                    if (window.logEngine) {
                        window.logEngine.addLog(updatedUe.id, 'SUCCESS', `${updatedUe.name} is now STABLE and ready`, {
                            previousStatus: 'starting',
                            newStatus: 'stable',
                            uptime: '5 seconds'
                        });
                    }

                    if (window.canvasRenderer) {
                        window.canvasRenderer.render();
                    }
                }
            }, 5000);
        });

        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }
    }

    /**
     * Execute docker compose -f docker-compose-ran.yml up -d oai-ue1 (start UE1 only)
     * @param {HTMLElement} output - Output element
     */
    async dockerComposeUe1Up(output) {
        this.addTerminalLine(output, 'WARN[0000] No services to build', 'warning');
        this.addTerminalLine(output, 'WARN[0000] Found orphan containers ([oai-upf oai-smf oai-amf oai-ausf oai-udm oai-udr mysql oai-nrf oai-ext-dn]) for this project. If you removed or renamed this service in your compose file, you can run this command with the --remove-orphans flag to clean it up.', 'warning');
        this.addTerminalLine(output, '[+] up 1/1', 'info');

        const allNFs = window.dataStore?.getAllNFs() || [];
        let ue1 = allNFs.find(nf => nf.type === 'UE' && nf.name === 'UE-1');

        if (!ue1 && window.nfManager) {
            const position = window.nfManager.calculateAutoPosition('UE', 1);
            ue1 = window.nfManager.createNetworkFunction('UE', position);
            
            if (ue1) {
                ue1.name = 'UE-1';
                ue1.createdAt = Date.now();
                ue1.status = 'starting';
                ue1.statusTimestamp = Date.now();
                window.dataStore.updateNF(ue1.id, ue1);
            }
        }

        const randomDelay = (Math.random() * 0.2 + 0.1).toFixed(1);
        this.addTerminalLine(output, `✔ Container oai-ue1 Created${' '.repeat(20)}${randomDelay}s`, 'success');
        await this.delay(parseFloat(randomDelay) * 1000);

        if (ue1) {
            setTimeout(() => {
                const updatedUe = window.dataStore?.getNFById(ue1.id);
                if (updatedUe) {
                    updatedUe.status = 'stable';
                    updatedUe.statusTimestamp = Date.now();
                    window.dataStore.updateNF(updatedUe.id, updatedUe);

                    if (window.logEngine) {
                        window.logEngine.addLog(updatedUe.id, 'SUCCESS', `${updatedUe.name} is now STABLE and ready`, {
                            previousStatus: 'starting',
                            newStatus: 'stable',
                            uptime: '5 seconds'
                        });
                    }

                    if (window.canvasRenderer) {
                        window.canvasRenderer.render();
                    }
                }
            }, 5000);
        }

        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }
    }

    /**
     * Execute docker compose -f docker-compose-ran.yml up -d oai-ue2 (start UE2 only)
     * @param {HTMLElement} output - Output element
     */
    async dockerComposeUe2Up(output) {
        this.addTerminalLine(output, 'WARN[0000] No services to build', 'warning');
        this.addTerminalLine(output, 'WARN[0000] Found orphan containers ([oai-upf oai-smf oai-amf oai-ausf oai-udm oai-udr mysql oai-nrf oai-ext-dn]) for this project. If you removed or renamed this service in your compose file, you can run this command with the --remove-orphans flag to clean it up.', 'warning');
        this.addTerminalLine(output, '[+] up 1/1', 'info');

        const allNFs = window.dataStore?.getAllNFs() || [];
        let ue2 = allNFs.find(nf => nf.type === 'UE' && nf.name === 'UE-2');

        if (!ue2 && window.nfManager) {
            const position = window.nfManager.calculateAutoPosition('UE', 2);
            ue2 = window.nfManager.createNetworkFunction('UE', position);
            
            if (ue2) {
                ue2.name = 'UE-2';
                ue2.createdAt = Date.now();
                ue2.status = 'starting';
                ue2.statusTimestamp = Date.now();
                window.dataStore.updateNF(ue2.id, ue2);
            }
        }

        const randomDelay = (Math.random() * 0.2 + 0.1).toFixed(1);
        this.addTerminalLine(output, `✔ Container oai-ue2 Created${' '.repeat(20)}${randomDelay}s`, 'success');
        await this.delay(parseFloat(randomDelay) * 1000);

        if (ue2) {
            setTimeout(() => {
                const updatedUe = window.dataStore?.getNFById(ue2.id);
                if (updatedUe) {
                    updatedUe.status = 'stable';
                    updatedUe.statusTimestamp = Date.now();
                    window.dataStore.updateNF(updatedUe.id, updatedUe);

                    if (window.logEngine) {
                        window.logEngine.addLog(updatedUe.id, 'SUCCESS', `${updatedUe.name} is now STABLE and ready`, {
                            previousStatus: 'starting',
                            newStatus: 'stable',
                            uptime: '5 seconds'
                        });
                    }

                    if (window.canvasRenderer) {
                        window.canvasRenderer.render();
                    }
                }
            }, 5000);
        }

        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }
    }

    /**
     * Execute docker compose -f docker-compose-gnb.yml down (stop gNB)
     * @param {HTMLElement} output - Output element
     */
    async dockerComposeGnbDown(output) {
        const allNFs = window.dataStore?.getAllNFs() || [];
        const gnb = allNFs.find(nf => nf.type === 'gNB');

        if (!gnb) {
            this.addTerminalLine(output, 'No gNB container to stop.', 'info');
            return;
        }

        this.addTerminalLine(output, '[+] Running 1/1', 'info');

        const randomDelay = (Math.random() * 0.3 + 0.1).toFixed(1);
        this.addTerminalLine(output, `✔ Container oai-gnb Removed${' '.repeat(20)}${randomDelay}s`, 'success');
        await this.delay(parseFloat(randomDelay) * 1000);

        // Remove gNB
        if (window.nfManager) {
            window.nfManager.deleteNetworkFunction(gnb.id);
        } else if (window.dataStore) {
            window.dataStore.removeNF(gnb.id);
        }

        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }
    }

    /**
     * Execute docker compose -f docker-compose-ue.yml down (stop all UEs)
     * @param {HTMLElement} output - Output element
     */
    async dockerComposeUeDown(output) {
        const allNFs = window.dataStore?.getAllNFs() || [];
        const ues = allNFs.filter(nf => nf.type === 'UE');

        if (ues.length === 0) {
            this.addTerminalLine(output, 'No UE containers to stop.', 'info');
            return;
        }

        this.addTerminalLine(output, `[+] Running ${ues.length}/${ues.length}`, 'info');

        for (let i = 0; i < ues.length; i++) {
            const ue = ues[i];
            const randomDelay = (Math.random() * 0.2 + 0.1).toFixed(1);
            this.addTerminalLine(output, `✔ Container oai-ue${i + 1} Removed${' '.repeat(20)}${randomDelay}s`, 'success');
            await this.delay(parseFloat(randomDelay) * 1000);

            // Remove UE
            if (window.nfManager) {
                window.nfManager.deleteNetworkFunction(ue.id);
            } else if (window.dataStore) {
                window.dataStore.removeNF(ue.id);
            }
        }

        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }
    }

    /**
     * Execute docker ps (show running containers)
     * @param {HTMLElement} output - Output element
     */
    async dockerPS(output) {
        const allNFs = window.dataStore?.getAllNFs() || [];

        if (allNFs.length === 0) {
            this.addTerminalLine(output, 'No containers running.', 'info');
            return;
        }

        // Header
        this.addTerminalLine(output, 'CONTAINER ID   IMAGE                                          COMMAND                  CREATED       STATUS                 PORTS                                                   NAMES', 'info');
        this.addTerminalLine(output, '────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────', 'info');

        // Map NF types to Docker service names
        const serviceNameMap = {
            'AMF': 'oai-amf',
            'SMF': 'oai-smf',
            'UPF': 'oai-upf',
            'AUSF': 'oai-ausf',
            'UDM': 'oai-udm',
            'UDR': 'oai-udr',
            'NRF': 'oai-nrf',
            'PCF': 'oai-pcf',
            'NSSF': 'oai-nssf',
            'MySQL': 'mysql',
            'ext-dn': 'ext-dn',
            'gNB': 'oai-gnb',
            'UE': 'oai-ue'
        };

        // Image map
        const imageMap = {
            'AMF': 'ghcr.io/openairinterface/oai-amf:develop',
            'SMF': 'ghcr.io/openairinterface/oai-smf:develop',
            'UPF': 'ghcr.io/openairinterface/oai-upf:develop',
            'AUSF': 'ghcr.io/openairinterface/oai-ausf:develop',
            'UDM': 'ghcr.io/openairinterface/oai-udm:develop',
            'UDR': 'ghcr.io/openairinterface/oai-udr:develop',
            'NRF': 'ghcr.io/openairinterface/oai-nrf:develop',
            'PCF': 'ghcr.io/openairinterface/oai-pcf:develop',
            'NSSF': 'ghcr.io/openairinterface/oai-nssf:develop',
            'MySQL': 'ghcr.io/openairinterface/mysql:8.0',
            'ext-dn': 'ghcr.io/openairinterface/trf-gen-cn5g:latest',
            'gNB': 'ghcr.io/openairinterface/oai-gnb:develop',
            'UE': 'ghcr.io/openairinterface/oai-ue:develop'
        };

        allNFs.forEach((nf, index) => {
            const containerId = this.generateContainerId();
            const serviceName = serviceNameMap[nf.type] || `oai-${nf.type.toLowerCase()}`;
            const image = imageMap[nf.type] || `ghcr.io/openairinterface/oai-${nf.type.toLowerCase()}:develop`;
            const status = nf.status === 'stable' ? 'Up (healthy)' : 'Up (starting)';
            const ports = this.getPortsForNF(nf);

            // Calculate creation time
            const createdAt = nf.createdAt || nf.statusTimestamp || Date.now();
            const createdTime = this.formatCreationTime(createdAt);

            const line = `${containerId}   ${image.padEnd(45)} "${serviceName}"   ${createdTime.padEnd(13)} ${status.padEnd(20)} ${ports.padEnd(55)} ${serviceName}`;
            this.addTerminalLine(output, line, nf.status === 'stable' ? 'success' : 'warning');
        });
    }

    /**
     * Start watch mode for docker compose ps -a
     * @param {HTMLElement} output - Output element
     */
    startWatch(output) {
        if (this.isWatching) {
            this.addTerminalLine(output, 'Watch mode is already running. Use Ctrl+C to stop.', 'warning');
            return;
        }

        this.isWatching = true;
        this.addTerminalLine(output, 'Starting watch mode (refreshes every 1 second)...', 'info');
        this.addTerminalLine(output, 'Press Ctrl+C to stop watching', 'info');
        this.addTerminalLine(output, '', 'blank');

        // Store initial content length to know where to clear from
        const initialLength = output.querySelectorAll('.docker-terminal-line').length;

        // Initial display
        this.showDockerComposePS(output);

        // Refresh every 1 second
        this.watchInterval = setInterval(() => {
            // Remove all lines added after the initial watch start message
            const allLines = output.querySelectorAll('.docker-terminal-line');
            const linesToRemove = Array.from(allLines).slice(initialLength);
            linesToRemove.forEach(line => line.remove());

            // Add fresh output
            this.showDockerComposePS(output);
        }, 1000);
    }

    /**
     * Stop watch mode
     */
    stopWatch() {
        if (this.watchInterval) {
            clearInterval(this.watchInterval);
            this.watchInterval = null;
            this.isWatching = false;
        }
    }

    /**
     * Show docker compose ps -a output
     * @param {HTMLElement} output - Output element
     */
    showDockerComposePS(output) {
        const allNFs = window.dataStore?.getAllNFs() || [];
        const timestamp = new Date().toLocaleString();

        // Header with timestamp
        this.addTerminalLine(output, `Every 1.0s: docker compose -f docker-compose.yml ps -a`, 'info');
        this.addTerminalLine(output, `Timestamp: ${timestamp}`, 'info');
        this.addTerminalLine(output, '', 'blank');

        if (allNFs.length === 0) {
            this.addTerminalLine(output, 'No services found.', 'info');
            return;
        }

        // Table header
        this.addTerminalLine(output, 'NAME         IMAGE                                     COMMAND                  SERVICE              CREATED              STATUS                        PORTS', 'info');
        this.addTerminalLine(output, '════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════', 'info');

        // Service name map
        const serviceNameMap = {
            'AMF': 'oai-amf',
            'SMF': 'oai-smf',
            'UPF': 'oai-upf',
            'AUSF': 'oai-ausf',
            'UDM': 'oai-udm',
            'UDR': 'oai-udr',
            'NRF': 'oai-nrf',
            'PCF': 'oai-pcf',
            'NSSF': 'oai-nssf',
            'MySQL': 'mysql',
            'ext-dn': 'ext-dn',
            'gNB': 'oai-gnb',
            'UE': 'oai-ue'
        };

        const imageMap = {
            'AMF': 'oaisoftwarealliance/oai-amf:2024-june',
            'SMF': 'oaisoftwarealliance/oai-smf:2024-june',
            'UPF': 'oaisoftwarealliance/oai-upf:2024-june',
            'AUSF': 'oaisoftwarealliance/oai-ausf:2024-june',
            'UDM': 'oaisoftwarealliance/oai-udm:2024-june',
            'UDR': 'oaisoftwarealliance/oai-udr:2024-june',
            'NRF': 'oaisoftwarealliance/oai-nrf:2024-june',
            'PCF': 'oaisoftwarealliance/oai-pcf:2024-june',
            'NSSF': 'oaisoftwarealliance/oai-nssf:2024-june',
            'MySQL': 'mysql:8.0',
            'ext-dn': 'oaisoftwarealliance/trf-gen-cn5g:latest',
            'gNB': 'oaisoftwarealliance/oai-gnb:2024-june',
            'UE': 'oaisoftwarealliance/oai-ue:2024-june'
        };

        allNFs.forEach(nf => {
            const serviceName = serviceNameMap[nf.type] || `oai-${nf.type.toLowerCase()}`;
            const image = imageMap[nf.type] || `oaisoftwarealliance/oai-${nf.type.toLowerCase()}:2024-june`;

            // Calculate creation time
            const createdAt = nf.createdAt || nf.statusTimestamp || Date.now();
            const created = this.formatCreationTimeForWatch(createdAt);
            const status = nf.status === 'stable' ? `Up ${created} (healthy)` : `Up ${created} (starting)`;
            const ports = this.getPortsForNF(nf);

            const statusColor = nf.status === 'stable' ? 'success' : 'warning';
            const statusIcon = nf.status === 'stable' ? '🟢' : '🔴';

            const line = `${serviceName.padEnd(12)} ${image.padEnd(38)} "${serviceName}"   ${serviceName.padEnd(15)} ${created.padEnd(20)} ${status.padEnd(28)} ${ports}`;
            this.addTerminalLine(output, `${statusIcon} ${line}`, statusColor);
        });
    }

    /**
     * Execute docker compose down (stop and remove all core network services)
     * @param {HTMLElement} output - Output element
     */
    async dockerComposeDown(output) {
        const allNFs = window.dataStore?.getAllNFs() || [];
        
        // Filter to only core network NFs (exclude gNB and UE)
        const coreNFs = allNFs.filter(nf => nf.type !== 'gNB' && nf.type !== 'UE');

        if (coreNFs.length === 0) {
            this.addTerminalLine(output, 'No core network services to stop.', 'info');
            return;
        }

        // Collect all NF IDs first (before deletion to avoid iteration issues)
        const nfIds = coreNFs.map(nf => ({ id: nf.id, name: nf.name, type: nf.type }));

        // Show Docker Compose style output
        this.addTerminalLine(output, `[+] Running ${nfIds.length + 1}/${nfIds.length + 1}`, 'info');

        // Stop and remove each service
        for (const nfInfo of nfIds) {
            // Skip gNB and UE (double check)
            if (nfInfo.type === 'gNB' || nfInfo.type === 'UE') {
                continue;
            }

            // Get service name
            const serviceNameMap = {
                'AMF': 'oai-amf', 'SMF': 'oai-smf', 'UPF': 'oai-upf', 'AUSF': 'oai-ausf',
                'UDM': 'oai-udm', 'UDR': 'oai-udr', 'NRF': 'oai-nrf', 'PCF': 'oai-pcf',
                'NSSF': 'oai-nssf', 'MySQL': 'mysql', 'ext-dn': 'oai-ext-dn'
            };
            const serviceName = serviceNameMap[nfInfo.type] || nfInfo.type.toLowerCase();

            // Random delay between 0.8s and 2.3s
            const randomDelay = (Math.random() * 1.5 + 0.8).toFixed(1);
            this.addTerminalLine(output, ` ✔ Container ${serviceName.padEnd(16)} Removed${' '.repeat(20)}${randomDelay}s`, 'success');
            await this.delay(parseFloat(randomDelay) * 1000);

            // Actually remove the NF (this also removes connections)
            if (window.nfManager) {
                window.nfManager.deleteNetworkFunction(nfInfo.id);
            } else if (window.dataStore) {
                window.dataStore.removeNF(nfInfo.id);
            }
        }

        // Also clear buses and bus connections
        if (window.dataStore) {
            const allBuses = window.dataStore.getAllBuses() || [];
            const allBusConnections = window.dataStore.getAllBusConnections() || [];

            if (allBuses.length > 0 || allBusConnections.length > 0) {
                const busConnectionIds = allBusConnections.map(bc => bc.id);
                const busIds = allBuses.map(bus => bus.id);

                busConnectionIds.forEach(busConnId => {
                    window.dataStore.removeBusConnection(busConnId);
                });

                busIds.forEach(busId => {
                    window.dataStore.removeBus(busId);
                });
            }
        }

        // Remove network
        this.addTerminalLine(output, ` ✔ Network oaiworkshop Removed${' '.repeat(20)}0.2s`, 'success');
        this.oaiWorkshopNetworkExists = false;
        this.oaiWorkshopCreatedTime = null;

        this.addTerminalLine(output, '', 'blank');

        // Re-render canvas
        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }
    }

    /**
     * Start a specific service
     * @param {string} serviceName - Service name to start
     * @param {HTMLElement} output - Output element
     */
    
    /**
     * Handle docker compose up -d <service> (start a specific service via compose)
     * @param {string} serviceName - Service name (e.g., oai-nrf)
     * @param {HTMLElement} output - Output element
     */
    async dockerComposeServiceUp(serviceName, output) {
        if (!serviceName) {
            this.addTerminalLine(output, 'Usage: docker compose -f docker-compose.yml up -d <service-name>', 'error');
            return;
        }

        // Map docker service name to NF type
        const serviceNameMap = {
            'oai-amf': 'AMF', 'oai-smf': 'SMF', 'oai-upf': 'UPF', 'oai-ausf': 'AUSF',
            'oai-udm': 'UDM', 'oai-udr': 'UDR', 'oai-nrf': 'NRF', 'oai-pcf': 'PCF',
            'oai-nssf': 'NSSF', 'mysql': 'MySQL', 'oai-ext-dn': 'ext-dn', 'oai-gnb': 'gNB', 'oai-ue': 'UE'
        };

        const nfType = serviceNameMap[serviceName.toLowerCase()];
        const allNFs = window.dataStore?.getAllNFs() || [];

        let nf = null;
        if (nfType) {
            nf = allNFs.find(n => n.type === nfType);
        }

        // If not found, try to find by exact service name stored as name
        if (!nf) {
            nf = allNFs.find(n => {
                const mapped = (serviceNameMap[((`oai-${n.type}`) || '').toLowerCase()]);
                return n.name === serviceName || (`oai-${n.type || ''}`) === serviceName;
            });
        }

        // If still not found, create via nfManager when possible
        if (!nf && window.nfManager && nfType) {
            // Try to get position from one-click.json first
            let position = await this.getPositionFromOneClick(nfType);
            
            // Fallback to auto-position if not found in one-click.json
            if (!position) {
                position = window.nfManager.calculateAutoPosition(nfType, 1);
            }

            nf = window.nfManager.createNetworkFunction(nfType, position);
            if (nf) {
                nf.createdAt = Date.now();
                nf.status = 'starting';
                nf.statusTimestamp = Date.now();
                window.dataStore.updateNF(nf.id, nf);

                // Auto-connect to buses from one-click.json
                await this.autoConnectToBusesFromOneClick(nf);
            }
        }

        if (!nf) {
            this.addTerminalLine(output, `Service '${serviceName}' not found.`, 'error');
            return;
        }

        this.addTerminalLine(output, 'WARN[0000] No services to build', 'warning');
        this.addTerminalLine(output, '[+] up 1/1', 'info');

        const randomDelay = (Math.random() * 0.3 + 0.1).toFixed(1);
        this.addTerminalLine(output, `✔ Container ${serviceName} Created${' '.repeat(20)}${randomDelay}s`, 'success');
        await this.delay(parseFloat(randomDelay) * 1000);

        // Mark starting and schedule stable status
        if (!nf.createdAt) nf.createdAt = Date.now();
        nf.status = 'starting';
        nf.statusTimestamp = Date.now();
        window.dataStore.updateNF(nf.id, nf);

        setTimeout(() => {
            const updated = window.dataStore?.getNFById(nf.id);
            if (updated) {
                updated.status = 'stable';
                updated.statusTimestamp = Date.now();
                window.dataStore.updateNF(updated.id, updated);

                if (window.logEngine) {
                    window.logEngine.addLog(updated.id, 'SUCCESS', `${updated.name} is now STABLE and ready`, {
                        previousStatus: 'starting', newStatus: 'stable', uptime: '5 seconds'
                    });
                }

                if (window.canvasRenderer) window.canvasRenderer.render();
            }
        }, 5000);

        if (window.canvasRenderer) window.canvasRenderer.render();
    }

    /**
     * Handle docker compose down <service> (stop a specific service via compose)
     * @param {string} serviceName - Service name (e.g., oai-nrf)
     * @param {HTMLElement} output - Output element
     */
    async dockerComposeServiceDown(serviceName, output) {
        if (!serviceName) {
            this.addTerminalLine(output, 'Usage: docker compose -f docker-compose.yml down <service-name>', 'error');
            return;
        }

        const serviceNameMap = {
            'oai-amf': 'AMF', 'oai-smf': 'SMF', 'oai-upf': 'UPF', 'oai-ausf': 'AUSF',
            'oai-udm': 'UDM', 'oai-udr': 'UDR', 'oai-nrf': 'NRF', 'oai-pcf': 'PCF',
            'oai-nssf': 'NSSF', 'mysql': 'MySQL', 'oai-ext-dn': 'ext-dn', 'oai-gnb': 'gNB', 'oai-ue': 'UE'
        };

        const nfType = serviceNameMap[serviceName.toLowerCase()];
        const allNFs = window.dataStore?.getAllNFs() || [];

        let nf = null;
        if (nfType) nf = allNFs.find(n => n.type === nfType);
        if (!nf) nf = allNFs.find(n => n.name === serviceName || (`oai-${n.type || ''}`) === serviceName);

        if (!nf) {
            this.addTerminalLine(output, `No ${serviceName} container to stop.`, 'info');
            return;
        }

        this.addTerminalLine(output, '[+] Running 1/1', 'info');
        const randomDelay = (Math.random() * 0.3 + 0.1).toFixed(1);
        this.addTerminalLine(output, `✔ Container ${serviceName} Removed${' '.repeat(20)}${randomDelay}s`, 'success');
        await this.delay(parseFloat(randomDelay) * 1000);

        // Remove NF
        if (window.nfManager) {
            window.nfManager.deleteNetworkFunction(nf.id);
        } else if (window.dataStore) {
            window.dataStore.removeNF(nf.id);
        }

        if (window.canvasRenderer) window.canvasRenderer.render();
    }

    async dockerStart(serviceName, output) {
        if (!serviceName) {
            this.addTerminalLine(output, 'Usage: docker start <service-name>', 'error');
            return;
        }

        const allNFs = window.dataStore?.getAllNFs() || [];
        const serviceNameMap = {
            'oai-amf': 'AMF', 'oai-smf': 'SMF', 'oai-upf': 'UPF', 'oai-ausf': 'AUSF',
            'oai-udm': 'UDM', 'oai-udr': 'UDR', 'oai-nrf': 'NRF', 'oai-pcf': 'PCF',
            'oai-nssf': 'NSSF', 'mysql': 'MySQL', 'ext-dn': 'ext-dn', 'oai-gnb': 'gNB', 'oai-ue': 'UE'
        };

        const nfType = serviceNameMap[serviceName.toLowerCase()];
        let nf = allNFs.find(n => n.type === nfType);

        // If NF doesn't exist, create it with position from one-click.json
        if (!nf && window.nfManager && nfType) {
            // Try to get position from one-click.json first
            let position = await this.getPositionFromOneClick(nfType);
            
            // Fallback to auto-position if not found in one-click.json
            if (!position) {
                position = window.nfManager.calculateAutoPosition(nfType, 1);
            }

            nf = window.nfManager.createNetworkFunction(nfType, position);
            if (nf) {
                nf.createdAt = Date.now();
                window.dataStore.updateNF(nf.id, nf);

                // Auto-connect to buses from one-click.json
                await this.autoConnectToBusesFromOneClick(nf);
            }
        }

        if (!nf) {
            this.addTerminalLine(output, `Service '${serviceName}' not found.`, 'error');
            return;
        }

        this.addTerminalLine(output, `Starting ${nf.name}...`, 'info');

        if (!nf.createdAt) {
            nf.createdAt = Date.now();
        }
        nf.status = 'starting';
        nf.statusTimestamp = Date.now();
        window.dataStore.updateNF(nf.id, nf);

        setTimeout(() => {
            if (window.dataStore?.getNFById(nf.id)) {
                nf.status = 'stable';
                nf.statusTimestamp = Date.now();
                window.dataStore.updateNF(nf.id, nf);
                if (window.canvasRenderer) {
                    window.canvasRenderer.render();
                }
            }
        }, 5000);

        this.addTerminalLine(output, `✅ ${nf.name} started (status: starting)`, 'success');
        this.addTerminalLine(output, 'Service will be stable in ~5 seconds', 'info');

        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }
    }

    /**
     * Stop a specific service
     * @param {string} serviceName - Service name to stop
     * @param {HTMLElement} output - Output element
     */
    async dockerStop(serviceName, output) {
        if (!serviceName) {
            this.addTerminalLine(output, 'Usage: docker stop <service-name>', 'error');
            return;
        }

        const allNFs = window.dataStore?.getAllNFs() || [];
        const serviceNameMap = {
            'oai-amf': 'AMF', 'oai-smf': 'SMF', 'oai-upf': 'UPF', 'oai-ausf': 'AUSF',
            'oai-udm': 'UDM', 'oai-udr': 'UDR', 'oai-nrf': 'NRF', 'oai-pcf': 'PCF',
            'oai-nssf': 'NSSF', 'mysql': 'MySQL', 'ext-dn': 'ext-dn', 'oai-gnb': 'gNB', 'oai-ue': 'UE'
        };

        const nfType = serviceNameMap[serviceName.toLowerCase()];
        const nf = allNFs.find(n => n.type === nfType);

        if (!nf) {
            this.addTerminalLine(output, `Service '${serviceName}' not found.`, 'error');
            return;
        }

        this.addTerminalLine(output, `Stopping ${nf.name}...`, 'info');
        nf.status = 'stopped';
        nf.statusTimestamp = Date.now();
        window.dataStore.updateNF(nf.id, nf);

        this.addTerminalLine(output, `✅ ${nf.name} stopped`, 'success');

        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }
    }

    /**
     * Add line to terminal output
     * @param {HTMLElement} output - Output element
     * @param {string} text - Text to add
     * @param {string} type - Line type
     */
    addTerminalLine(output, text, type = 'normal') {
        const line = document.createElement('div');
        line.className = `docker-terminal-line docker-terminal-${type}`;
        line.innerHTML = text || '&nbsp;';
        output.appendChild(line);
        output.scrollTop = output.scrollHeight;
    }

    /**
     * Generate container ID
     * @returns {string} Random container ID
     */
    generateContainerId() {
        const chars = '0123456789abcdef';
        let id = '';
        for (let i = 0; i < 12; i++) {
            id += chars[Math.floor(Math.random() * chars.length)];
        }
        return id;
    }

    /**
     * Get ports for NF
     * @param {Object} nf - Network Function
     * @returns {string} Ports string
     */
    getPortsForNF(nf) {
        const portMap = {
            'AMF': '80/tcp, 8080/tcp, 9090/tcp, 38412/sctp',
            'SMF': '80/tcp, 8080/tcp, 8805/udp',
            'UPF': '2152/udp, 8805/udp',
            'AUSF': '80/tcp, 8080/tcp',
            'UDM': '80/tcp, 8080/tcp',
            'UDR': '80/tcp, 8080/tcp',
            'NRF': '80/tcp, 8080/tcp, 9090/tcp',
            'PCF': '80/tcp, 8080/tcp',
            'NSSF': '80/tcp, 8080/tcp',
            'MySQL': '3306/tcp, 33060/tcp',
            'gNB': '2152/udp, 38412/sctp',
            'UE': '2152/udp'
        };
        return portMap[nf.type] || `${nf.config.port}/tcp`;
    }

    /**
     * Create default NFs as fallback
     * @param {HTMLElement} output - Output element
     */
    async createDefaultNFs(output) {
        const defaultNFs = this.getDefaultNFConfigurations();
        const creationTime = Date.now();

        for (const nfConfig of defaultNFs) {
            this.addTerminalLine(output, `Creating ${nfConfig.type}...`, 'info');

            const position = window.nfManager.calculateAutoPosition(nfConfig.type, 1);
            const nf = window.nfManager.createNetworkFunction(nfConfig.type, position);

            if (nf) {
                nf.config.ipAddress = nfConfig.ipAddress;
                nf.config.port = nfConfig.port;
                nf.config.httpProtocol = nfConfig.httpProtocol || 'HTTP/2';
                nf.createdAt = creationTime;
                window.dataStore.updateNF(nf.id, nf);
                this.addTerminalLine(output, `✅ ${nf.name} created (${nfConfig.ipAddress}:${nfConfig.port})`, 'success');
                await this.delay(200);
            }
        }

        this.addTerminalLine(output, '', 'blank');
        this.addTerminalLine(output, `✅ Created ${defaultNFs.length} default Network Functions`, 'success');
    }

    /**
     * Filter topology to exclude gNB and UE
     * @param {Object} topology - Topology object
     * @returns {Object} Filtered topology
     */
    filterTopology(topology) {
        const filtered = JSON.parse(JSON.stringify(topology));

        if (filtered.nfs && Array.isArray(filtered.nfs)) {
            filtered.nfs = filtered.nfs.filter(nf => nf.type !== 'gNB' && nf.type !== 'UE');
        }

        const serviceBusNFIds = new Set();
        if (filtered.buses && Array.isArray(filtered.buses)) {
            filtered.buses.forEach(bus => {
                if (bus.connections && Array.isArray(bus.connections)) {
                    bus.connections.forEach(nfId => {
                        serviceBusNFIds.add(nfId);
                    });
                }
            });
        }

        if (filtered.busConnections && Array.isArray(filtered.busConnections)) {
            filtered.busConnections.forEach(busConn => {
                serviceBusNFIds.add(busConn.nfId);
            });
        }

        if (filtered.connections && Array.isArray(filtered.connections)) {
            const excludedNFIds = new Set();
            if (topology.nfs) {
                topology.nfs.forEach(nf => {
                    if (nf.type === 'gNB' || nf.type === 'UE') {
                        excludedNFIds.add(nf.id);
                    }
                });
            }

            filtered.connections = filtered.connections.filter(conn => {
                if (excludedNFIds.has(conn.sourceId) || excludedNFIds.has(conn.targetId)) {
                    return false;
                }

                const bothOnServiceBus = serviceBusNFIds.has(conn.sourceId) && serviceBusNFIds.has(conn.targetId);
                if (bothOnServiceBus) {
                    const serviceBusInterfaces = ['Nnrf_NFManagement', 'Nnrf_NFDiscovery', 'Nnrf',
                        'Namf', 'Nsmf', 'Nausf', 'Nudm', 'Npcf', 'Nnssf', 'Nudr'];
                    const isServiceBusInterface = serviceBusInterfaces.some(iface =>
                        conn.interfaceName?.includes(iface) || conn.interfaceName === iface);
                    if (isServiceBusInterface) {
                        return false;
                    }
                }
                return true;
            });
        }

        if (filtered.busConnections && Array.isArray(filtered.busConnections)) {
            const excludedNFIds = new Set();
            if (topology.nfs) {
                topology.nfs.forEach(nf => {
                    if (nf.type === 'gNB' || nf.type === 'UE') {
                        excludedNFIds.add(nf.id);
                    }
                });
            }
            filtered.busConnections = filtered.busConnections.filter(busConn => !excludedNFIds.has(busConn.nfId));
        }

        if (filtered.buses && Array.isArray(filtered.buses)) {
            filtered.buses.forEach(bus => {
                if (bus.connections && Array.isArray(bus.connections)) {
                    const excludedNFIds = new Set();
                    if (topology.nfs) {
                        topology.nfs.forEach(nf => {
                            if (nf.type === 'gNB' || nf.type === 'UE') {
                                excludedNFIds.add(nf.id);
                            }
                        });
                    }
                    bus.connections = bus.connections.filter(nfId => !excludedNFIds.has(nfId));
                }
            });
        }

        return filtered;
    }

    /**
     * Get default NF configurations
     * @returns {Array} Array of default NF configurations
     */
    getDefaultNFConfigurations() {
        return [
            { type: 'NRF', ipAddress: '192.168.1.10', port: 8080, httpProtocol: 'HTTP/2' },
            { type: 'AMF', ipAddress: '192.168.1.20', port: 8080, httpProtocol: 'HTTP/2' },
            { type: 'SMF', ipAddress: '192.168.1.30', port: 8080, httpProtocol: 'HTTP/2' },
            { type: 'UPF', ipAddress: '192.168.1.40', port: 8080, httpProtocol: 'HTTP/2' },
            { type: 'AUSF', ipAddress: '192.168.1.50', port: 8080, httpProtocol: 'HTTP/2' },
            { type: 'UDM', ipAddress: '192.168.1.60', port: 8080, httpProtocol: 'HTTP/2' },
            { type: 'UDR', ipAddress: '192.168.1.70', port: 8080, httpProtocol: 'HTTP/2' },
            { type: 'PCF', ipAddress: '192.168.1.80', port: 8080, httpProtocol: 'HTTP/2' },
            { type: 'NSSF', ipAddress: '192.168.1.90', port: 8080, httpProtocol: 'HTTP/2' },
            { type: 'MySQL', ipAddress: '192.168.1.100', port: 3306, httpProtocol: 'HTTP/2' }
        ];
    }

    /**
     * Format creation time for docker ps
     * @param {number} timestamp - Creation timestamp
     * @returns {string} Formatted time string
     */
    formatCreationTime(timestamp) {
        if (!timestamp) return '3 weeks ago';
        const now = Date.now();
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (seconds < 60) {
            return `${seconds} second${seconds !== 1 ? 's' : ''} ago`;
        } else if (minutes < 60) {
            return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
        } else if (hours < 24) {
            return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
        } else if (days < 7) {
            return `${days} day${days !== 1 ? 's' : ''} ago`;
        } else if (days < 30) {
            const weeks = Math.floor(days / 7);
            return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
        } else {
            const months = Math.floor(days / 30);
            return `${months} month${months !== 1 ? 's' : ''} ago`;
        }
    }

    /**
     * Format creation time for watch command
     * @param {number} timestamp - Creation timestamp
     * @returns {string} Formatted time string
     */
    formatCreationTimeForWatch(timestamp) {
        if (!timestamp) return 'About a minute ago';
        const now = Date.now();
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);

        if (seconds < 30) {
            return 'Just now';
        } else if (seconds < 60) {
            return 'About a minute ago';
        } else if (minutes === 1) {
            return 'About a minute ago';
        } else if (minutes < 60) {
            return `About ${minutes} minutes ago`;
        } else {
            const hours = Math.floor(minutes / 60);
            if (hours === 1) {
                return 'About an hour ago';
            } else if (hours < 24) {
                return `About ${hours} hours ago`;
            } else {
                const days = Math.floor(hours / 24);
                if (days === 1) {
                    return 'About a day ago';
                } else {
                    return `About ${days} days ago`;
                }
            }
        }
    }

    /**
     * Delay helper
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise} Promise that resolves after delay
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Setup window controls (drag, resize, minimize, maximize)
     * @param {HTMLElement} terminalModal - Terminal modal element
     */
    setupWindowControls(terminalModal) {
        const terminalWindow = document.getElementById('docker-terminal-window');
        const titlebar = document.getElementById('docker-terminal-titlebar');
        const minimizeBtn = document.getElementById('docker-terminal-minimize');
        const maximizeBtn = document.getElementById('docker-terminal-maximize');
        const resizeHandle = document.getElementById('docker-terminal-resize-handle');

        if (!terminalWindow || !titlebar) return;

        // Dragging functionality
        let isDragging = false;
        let dragStartX = 0;
        let dragStartY = 0;
        let windowStartX = 0;
        let windowStartY = 0;

        titlebar.addEventListener('mousedown', (e) => {
            if (e.target.closest('.docker-terminal-btn')) return;
            if (this.terminalState.isMaximized) return;

            isDragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;

            const rect = terminalWindow.getBoundingClientRect();
            windowStartX = rect.left;
            windowStartY = rect.top;

            titlebar.style.cursor = 'grabbing';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const deltaX = e.clientX - dragStartX;
            const deltaY = e.clientY - dragStartY;

            const newX = windowStartX + deltaX;
            const newY = windowStartY + deltaY;

            const maxX = window.innerWidth - terminalWindow.offsetWidth;
            const maxY = window.innerHeight - terminalWindow.offsetHeight;

            this.terminalState.x = Math.max(0, Math.min(newX, maxX));
            this.terminalState.y = Math.max(0, Math.min(newY, maxY));

            terminalWindow.style.left = this.terminalState.x + 'px';
            terminalWindow.style.top = this.terminalState.y + 'px';
            terminalWindow.style.transform = 'none';
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                titlebar.style.cursor = 'grab';
                this.saveTerminalState();
            }
        });

        // Resizing functionality
        let isResizing = false;
        let resizeStartX = 0;
        let resizeStartY = 0;
        let startWidth = 0;
        let startHeight = 0;

        if (resizeHandle) {
            resizeHandle.addEventListener('mousedown', (e) => {
                if (this.terminalState.isMaximized) return;
                isResizing = true;
                resizeStartX = e.clientX;
                resizeStartY = e.clientY;
                startWidth = terminalWindow.offsetWidth;
                startHeight = terminalWindow.offsetHeight;
                e.preventDefault();
                e.stopPropagation();
            });
        }

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;

            const deltaX = e.clientX - resizeStartX;
            const deltaY = e.clientY - resizeStartY;

            const newWidth = Math.max(400, Math.min(startWidth + deltaX, window.innerWidth - 100));
            const newHeight = Math.max(300, Math.min(startHeight + deltaY, window.innerHeight - 100));

            this.terminalState.width = newWidth;
            this.terminalState.height = newHeight;

            terminalWindow.style.width = newWidth + 'px';
            terminalWindow.style.height = newHeight + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                this.saveTerminalState();
            }
        });

        // Minimize button
        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', () => {
                this.minimizeTerminal(terminalWindow);
            });
        }

        // Maximize button
        if (maximizeBtn) {
            maximizeBtn.addEventListener('click', () => {
                this.toggleMaximize(terminalWindow);
            });
        }

        // Double-click titlebar to maximize/restore
        titlebar.addEventListener('dblclick', (e) => {
            if (e.target.closest('.docker-terminal-btn')) return;
            this.toggleMaximize(terminalWindow);
        });

        titlebar.style.cursor = 'grab';
    }

    /**
     * Minimize terminal window
     * @param {HTMLElement} terminalWindow - Terminal window element
     */
    minimizeTerminal(terminalWindow) {
        this.terminalState.isMinimized = !this.terminalState.isMinimized;

        if (this.terminalState.isMinimized) {
            terminalWindow.style.height = '35px';
            const content = document.getElementById('docker-terminal-content');
            if (content) content.style.display = 'none';
            const resizeHandle = document.getElementById('docker-terminal-resize-handle');
            if (resizeHandle) resizeHandle.style.display = 'none';
        } else {
            terminalWindow.style.height = this.terminalState.height + 'px';
            const content = document.getElementById('docker-terminal-content');
            if (content) content.style.display = 'flex';
            const resizeHandle = document.getElementById('docker-terminal-resize-handle');
            if (resizeHandle) resizeHandle.style.display = 'block';
        }

        this.saveTerminalState();
    }

    /**
     * Toggle maximize/restore terminal window
     * @param {HTMLElement} terminalWindow - Terminal window element
     */
    toggleMaximize(terminalWindow) {
        this.terminalState.isMaximized = !this.terminalState.isMaximized;
        const maximizeBtn = document.getElementById('docker-terminal-maximize');

        if (this.terminalState.isMaximized) {
            if (!terminalWindow.style.left) {
                const rect = terminalWindow.getBoundingClientRect();
                this.terminalState.x = rect.left;
                this.terminalState.y = rect.top;
            }

            terminalWindow.style.left = '0';
            terminalWindow.style.top = '0';
            terminalWindow.style.width = '100vw';
            terminalWindow.style.height = '100vh';
            terminalWindow.style.transform = 'none';
            terminalWindow.style.borderRadius = '0';
            if (maximizeBtn) maximizeBtn.textContent = '❐';
        } else {
            terminalWindow.style.width = this.terminalState.width + 'px';
            terminalWindow.style.height = this.terminalState.height + 'px';
            terminalWindow.style.borderRadius = '8px 8px 0 0';

            if (this.terminalState.x !== null && this.terminalState.y !== null) {
                terminalWindow.style.left = this.terminalState.x + 'px';
                terminalWindow.style.top = this.terminalState.y + 'px';
                terminalWindow.style.transform = 'none';
            } else {
                terminalWindow.style.left = '';
                terminalWindow.style.top = '';
                terminalWindow.style.transform = '';
            }

            if (maximizeBtn) maximizeBtn.textContent = '□';
        }

        this.saveTerminalState();
    }

    /**
     * Apply saved terminal state
     */
    applyTerminalState() {
        const terminalWindow = document.getElementById('docker-terminal-window');
        if (!terminalWindow) return;

        const savedState = localStorage.getItem('dockerTerminalState');
        if (savedState) {
            try {
                const state = JSON.parse(savedState);
                this.terminalState = { ...this.terminalState, ...state };
            } catch (e) {
                console.warn('Failed to load terminal state:', e);
            }
        }

        terminalWindow.style.width = this.terminalState.width + 'px';
        terminalWindow.style.height = this.terminalState.height + 'px';

        if (this.terminalState.x !== null && this.terminalState.y !== null) {
            terminalWindow.style.left = this.terminalState.x + 'px';
            terminalWindow.style.top = this.terminalState.y + 'px';
            terminalWindow.style.transform = 'none';
        }

        if (this.terminalState.isMaximized) {
            this.toggleMaximize(terminalWindow);
        }

        if (this.terminalState.isMinimized) {
            this.minimizeTerminal(terminalWindow);
        }
    }

    /**
     * Save terminal state to localStorage
     */
    saveTerminalState() {
        try {
            localStorage.setItem('dockerTerminalState', JSON.stringify(this.terminalState));
        } catch (e) {
            console.warn('Failed to save terminal state:', e);
        }
    }

    /**
     * Docker network ls command
     * @param {HTMLElement} output - Output element
     */
    dockerNetworkLS(output) {
        this.addTerminalLine(output, 'NETWORK ID     NAME          DRIVER    SCOPE', 'info');
        this.addTerminalLine(output, 'df33e4a6502d   bridge        bridge    local', 'info');
        this.addTerminalLine(output, '902c1fcc4369   host          host      local', 'info');
        this.addTerminalLine(output, '0c712814bbb0   none          null      local', 'info');

        if (this.oaiWorkshopNetworkExists) {
            this.addTerminalLine(output, `${this.oaiWorkshopNetworkId}   oaiworkshop   bridge    local`, 'success');
        }
    }

    /**
     * Docker network inspect command
     * @param {string} networkName - Network name to inspect
     * @param {HTMLElement} output - Output element
     */
    dockerNetworkInspect(networkName, output) {
        if (networkName === 'bridge') {
            this.inspectBridgeNetwork(output);
        } else if (networkName === 'host') {
            this.inspectHostNetwork(output);
        } else if (networkName === 'none') {
            this.inspectNoneNetwork(output);
        } else if (networkName === 'oaiworkshop') {
            if (this.oaiWorkshopNetworkExists) {
                this.inspectOAIWorkshopNetwork(output);
            } else {
                this.addTerminalLine(output, `Error: No such network: ${networkName}`, 'error');
            }
        } else {
            this.addTerminalLine(output, `Error: No such network: ${networkName}`, 'error');
        }
    }

    /**
     * Inspect bridge network
     * @param {HTMLElement} output - Output element
     */
    inspectBridgeNetwork(output) {
        const json = {
            "Name": "bridge",
            "Id": "df33e4a6502d1229e87fbd225ce8cc4b95fd4553fcaadee50fd5a70a4a021f3d",
            "Created": "2026-01-30T15:26:16.417604705+05:30",
            "Scope": "local",
            "Driver": "bridge",
            "EnableIPv4": true,
            "EnableIPv6": false,
            "IPAM": {
                "Driver": "default",
                "Options": null,
                "Config": [{ "Subnet": "172.17.0.0/16", "Gateway": "172.17.0.1" }]
            },
            "Internal": false,
            "Attachable": false,
            "Ingress": false,
            "ConfigFrom": { "Network": "" },
            "ConfigOnly": false,
            "Containers": {},
            "Options": {
                "com.docker.network.bridge.default_bridge": "true",
                "com.docker.network.bridge.enable_icc": "true",
                "com.docker.network.bridge.enable_ip_masquerade": "true",
                "com.docker.network.bridge.host_binding_ipv4": "0.0.0.0",
                "com.docker.network.bridge.name": "docker0",
                "com.docker.network.driver.mtu": "1500"
            },
            "Labels": {}
        };
        this.addTerminalLine(output, JSON.stringify([json], null, 2), 'info');
    }

    /**
     * Inspect host network
     * @param {HTMLElement} output - Output element
     */
    inspectHostNetwork(output) {
        const json = {
            "Name": "host",
            "Id": "902c1fcc436950abba5007bd8b39b65ab96fd9c72b3873519ebc55bc14315b74",
            "Created": "2026-01-20T15:04:16.397276602+05:30",
            "Scope": "local",
            "Driver": "host",
            "EnableIPv4": true,
            "EnableIPv6": false,
            "IPAM": { "Driver": "default", "Options": null, "Config": null },
            "Internal": false,
            "Attachable": false,
            "Ingress": false,
            "ConfigFrom": { "Network": "" },
            "ConfigOnly": false,
            "Containers": {},
            "Options": {},
            "Labels": {}
        };
        this.addTerminalLine(output, JSON.stringify([json], null, 2), 'info');
    }

    /**
     * Inspect none network
     * @param {HTMLElement} output - Output element
     */
    inspectNoneNetwork(output) {
        const json = {
            "Name": "none",
            "Id": "0c712814bbb0c32a4d2846f885d90534121f472d0c71d0c34330ad6da8327020",
            "Created": "2026-01-20T15:04:16.389588497+05:30",
            "Scope": "local",
            "Driver": "null",
            "EnableIPv4": true,
            "EnableIPv6": false,
            "IPAM": { "Driver": "default", "Options": null, "Config": null },
            "Internal": false,
            "Attachable": false,
            "Ingress": false,
            "ConfigFrom": { "Network": "" },
            "ConfigOnly": false,
            "Containers": {},
            "Options": {},
            "Labels": {}
        };
        this.addTerminalLine(output, JSON.stringify([json], null, 2), 'info');
    }

    /**
     * Inspect OAI workshop network
     * @param {HTMLElement} output - Output element
     */
    inspectOAIWorkshopNetwork(output) {
        const allNFs = window.dataStore?.getAllNFs() || [];
        const containers = {};

        allNFs.forEach(nf => {
            const serviceNameMap = {
                'AMF': 'oai-amf', 'SMF': 'oai-smf', 'UPF': 'oai-upf', 'AUSF': 'oai-ausf',
                'UDM': 'oai-udm', 'UDR': 'oai-udr', 'NRF': 'oai-nrf', 'PCF': 'oai-pcf',
                'NSSF': 'oai-nssf', 'MySQL': 'mysql', 'ext-dn': 'oai-ext-dn'
            };
            const serviceName = serviceNameMap[nf.type] || nf.type.toLowerCase();
            const containerId = this.generateContainerId() + this.generateContainerId() + this.generateContainerId() + this.generateContainerId() + this.generateContainerId() + 'abcd';

            containers[containerId] = {
                "Name": serviceName,
                "EndpointID": this.generateContainerId() + this.generateContainerId() + this.generateContainerId() + this.generateContainerId() + this.generateContainerId() + 'ef01',
                "MacAddress": this.generateMacAddress(),
                "IPv4Address": nf.config.ipAddress + "/26",
                "IPv6Address": ""
            };
        });

        const createdTime = this.oaiWorkshopCreatedTime ? new Date(this.oaiWorkshopCreatedTime).toISOString() : new Date().toISOString();

        const json = {
            "Name": "oaiworkshop",
            "Id": this.oaiWorkshopNetworkId + "d0a87f40b563d8172b3f54045b0da9d9b859ed25522c2aaa8b86",
            "Created": createdTime,
            "Scope": "local",
            "Driver": "bridge",
            "EnableIPv4": true,
            "EnableIPv6": false,
            "IPAM": {
                "Driver": "default",
                "Options": null,
                "Config": [{ "Subnet": "192.168.70.0/26" }]
            },
            "Internal": false,
            "Attachable": false,
            "Ingress": false,
            "ConfigFrom": { "Network": "" },
            "ConfigOnly": false,
            "Containers": containers,
            "Options": { "com.docker.network.bridge.name": "oaiworkshop" },
            "Labels": {
                "com.docker.compose.config-hash": "dca0e19cf413805e199db52df7a818f82ffd4a571265d5f722c8e2198676da59",
                "com.docker.compose.network": "public_net",
                "com.docker.compose.project": "cn",
                "com.docker.compose.version": "5.0.1"
            }
        };

        this.addTerminalLine(output, JSON.stringify([json], null, 2), 'info');
    }

    /**
     * Generate network ID
     * @returns {string} Random network ID
     */
    generateNetworkId() {
        const chars = '0123456789abcdef';
        let id = '';
        for (let i = 0; i < 12; i++) {
            id += chars[Math.floor(Math.random() * chars.length)];
        }
        return id;
    }

    /**
     * Generate MAC address
     * @returns {string} Random MAC address
     */
    generateMacAddress() {
        const chars = '0123456789abcdef';
        let mac = '';
        for (let i = 0; i < 6; i++) {
            if (i > 0) mac += ':';
            mac += chars[Math.floor(Math.random() * chars.length)];
            mac += chars[Math.floor(Math.random() * chars.length)];
        }
        return mac;
    }

    /**
     * Docker version command
     * @param {HTMLElement} output - Output element
     */
    dockerVersion(output) {
        this.addTerminalLine(output, 'Client: Docker Engine - Community', 'info');
        this.addTerminalLine(output, ' Version:           28.0.4', 'info');
        this.addTerminalLine(output, ' API version:       1.48', 'info');
        this.addTerminalLine(output, ' Go version:        go1.23.7', 'info');
        this.addTerminalLine(output, ' Git commit:        b8034c0', 'info');
        this.addTerminalLine(output, ' Built:             Tue Mar 25 15:07:11 2025', 'info');
        this.addTerminalLine(output, ' OS/Arch:           linux/amd64', 'info');
        this.addTerminalLine(output, ' Context:           default', 'info');
        this.addTerminalLine(output, '', 'blank');
        this.addTerminalLine(output, 'Server: Docker Engine - Community', 'info');
        this.addTerminalLine(output, ' Engine:', 'info');
        this.addTerminalLine(output, '  Version:          28.0.4', 'info');
        this.addTerminalLine(output, '  API version:      1.48 (minimum version 1.24)', 'info');
        this.addTerminalLine(output, '  Go version:       go1.23.7', 'info');
        this.addTerminalLine(output, '  Git commit:       6430e49', 'info');
        this.addTerminalLine(output, '  Built:            Tue Mar 25 15:07:11 2025', 'info');
        this.addTerminalLine(output, '  OS/Arch:          linux/amd64', 'info');
        this.addTerminalLine(output, '  Experimental:     false', 'info');
        this.addTerminalLine(output, ' containerd:', 'info');
        this.addTerminalLine(output, '  Version:          v2.2.1', 'info');
        this.addTerminalLine(output, '  GitCommit:        dea7da592f5d1d2b7755e3a161be07f43fad8f75', 'info');
        this.addTerminalLine(output, ' runc:', 'info');
        this.addTerminalLine(output, '  Version:          1.3.4', 'info');
        this.addTerminalLine(output, '  GitCommit:        v1.3.4-0-gd6d73eb8', 'info');
        this.addTerminalLine(output, ' docker-init:', 'info');
        this.addTerminalLine(output, '  Version:          0.19.0', 'info');
        this.addTerminalLine(output, '  GitCommit:        de40ad0', 'info');
    }
}

// Initialize global instance
window.dockerTerminal = new DockerTerminal();
