/**
 * ============================================
 * DEPLOYMENT MANAGER
 * ============================================
 * Handles one-click deployment of complete 5G topology
 * 
 * Responsibilities:
 * - Deploy network functions in correct sequence
 * - Create bus lines first
 * - Follow 5G architecture dependencies
 * - Show deployment progress with logs
 * - Handle timing and stabilization
 */

class DeploymentManager {
    constructor() {
        this.isDeploying = false;
        this.deploymentProgress = 0;
        this.totalSteps = 0;
        this.currentStep = 0;
        this.deploymentLogs = [];
        this.preloadedLogs = null; // Store preloaded logs from 5g-logs.json
        this.nfIdMapping = {}; // Map old NF IDs to new NF IDs
        this.suppressAlerts = false; // Flag to suppress alerts during deployment
        
        console.log('✅ DeploymentManager initialized');
    }

    /**
     * Load logs from 5g-logs.json file
     */
    async loadDeploymentLogs() {
        try {
            const response = await fetch('../5g-logs.json');
            if (response.ok) {
                const data = await response.json();
                this.preloadedLogs = data.logs;
                console.log('📋 Loaded', this.preloadedLogs.length, 'logs from 5g-logs.json');
                return true;
            }
        } catch (error) {
            console.warn('⚠️ Could not load 5g-logs.json, will generate logs dynamically');
        }
        return false;
    }

    /**
     * Start one-click deployment based on topology configuration
     * @param {Object} topology - Topology configuration from one-click.json
     */
    async startOneClickDeployment(topology) {
        if (this.isDeploying) {
            console.log('⚠️ Deployment already in progress. Please wait...');
            return;
        }

        console.log('🚀 Starting one-click deployment...');
        this.isDeploying = true;
        this.suppressAlerts = true; // Suppress all alerts during deployment
        this.deploymentProgress = 0;
        this.currentStep = 0;
        this.deploymentLogs = [];
        this.nfIdMapping = {}; // Reset mapping

        try {
            // Load preloaded logs from 5g-logs.json
            await this.loadDeploymentLogs();

            // Clear existing topology first
            await this.clearTopology();

            // Calculate total steps
            this.totalSteps = 1 + // Bus creation
                            topology.nfs.length + // NF creation
                            topology.connections.length + // Connections
                            topology.busConnections.length; // Bus connections

            // Update UI to show deployment in progress
            this.updateDeploymentUI(true);

            // Step 1: Create Service Bus first
            await this.createServiceBus(topology.buses[0]);
            this.updateProgress();

            // Step 2: Deploy Network Functions in dependency order
            const deploymentOrder = this.getDeploymentOrder(topology.nfs);
            
            for (const nf of deploymentOrder) {
                await this.deployNetworkFunction(nf);
                this.updateProgress();
                
                // Wait for NF to stabilize (5 seconds as per logs)
                await this.waitForStabilization(nf);
            }

            // Step 3: Create Bus Connections
            for (const busConn of topology.busConnections) {
                await this.createBusConnection(busConn, topology);
                this.updateProgress();
            }

            // Step 4: Create Interface Connections
            for (const conn of topology.connections) {
                await this.createInterfaceConnection(conn, topology);
                this.updateProgress();
            }

            // Step 5: Final validation and completion
            await this.completeDeployment();

            console.log('✅ One-click deployment completed successfully!');
            // Removed success alert - deployment completes silently

        } catch (error) {
            console.error('❌ Deployment failed:', error);
            // Only log error, don't show alert during deployment
        } finally {
            this.isDeploying = false;
            this.suppressAlerts = false; // Re-enable alerts after deployment
            this.updateDeploymentUI(false);
        }
    }

    /**
     * Clear existing topology
     */
    async clearTopology() {
        console.log('🗑️ Clearing existing topology...');
        
        if (window.dataStore) {
            window.dataStore.clearAll();
        }

        if (window.logEngine) {
            window.logEngine.clearAllLogs();
        }

        // Clear log UI
        const logContent = document.getElementById('log-content');
        if (logContent) {
            logContent.innerHTML = '';
        }

        // Re-render canvas
        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }

        // Wait for any automatic bus creation to complete
        await this.delay(200);

        // Clear any automatically created buses
        if (window.dataStore) {
            const existingBuses = window.dataStore.getAllBuses();
            existingBuses.forEach(bus => {
                window.dataStore.removeBus(bus.id);
            });
        }

        // Add system initialization log
        if (window.logEngine) {
            window.logEngine.addLog('system', 'SUCCESS', '5G SBA Dashboard initialized and ready', {
                version: '1.0.0',
                httpProtocol: 'HTTP/2',
                timestamp: new Date().toISOString()
            });
        }

        await this.delay(500); // Brief pause for UI update
    }

    /**
     * Create service bus
     * @param {Object} busConfig - Bus configuration
     */
    async createServiceBus(busConfig) {
        console.log('🚌 Creating Service Bus...');

        if (window.busManager) {
            const bus = window.busManager.createBusLine(
                busConfig.orientation,
                busConfig.position,
                busConfig.length,
                busConfig.name
            );

            if (bus) {
                // Update bus properties to match topology
                bus.color = busConfig.color || '#3498db';
                bus.thickness = busConfig.thickness || 8;
                bus.type = busConfig.type || 'service-bus';
                
                // Update in data store
                if (window.dataStore && window.dataStore.updateBus) {
                    window.dataStore.updateBus(bus.id, bus);
                }

                if (window.logEngine) {
                    window.logEngine.addLog('system', 'SUCCESS', `${busConfig.name} created successfully`, {
                        busId: bus.id,
                        orientation: busConfig.orientation,
                        length: busConfig.length,
                        type: busConfig.type
                    });
                }

                // Re-render canvas
                if (window.canvasRenderer) {
                    window.canvasRenderer.render();
                }
            }
        }

        await this.delay(1000);
    }

    /**
     * Get deployment order based on 5G architecture dependencies
     * @param {Array} nfs - Network functions from topology
     * @returns {Array} Ordered list of NFs for deployment
     */
    getDeploymentOrder(nfs) {
        // Deployment order based on 5G architecture and logs sequence
        const order = ['NRF', 'AMF', 'SMF', 'UPF', 'AUSF', 'ext-dn', 'UDM', 'PCF', 'NSSF', 'UDR', 'MySQL', 'gNB', 'UE'];
        
        const orderedNFs = [];
        
        // Sort NFs according to deployment order
        for (const type of order) {
            const nfsOfType = nfs.filter(nf => nf.type === type);
            orderedNFs.push(...nfsOfType);
        }

        return orderedNFs;
    }

    /**
     * Deploy a single network function
     * @param {Object} nfConfig - NF configuration from topology
     */
    async deployNetworkFunction(nfConfig) {
        console.log(`🚀 Deploying ${nfConfig.type}: ${nfConfig.name}...`);

        if (window.nfManager) {
            // Create NF with specified position and configuration
            const nf = window.nfManager.createNetworkFunction(nfConfig.type, nfConfig.position);
            
            if (nf) {
                // Update NF with topology configuration
                nf.name = nfConfig.name;
                nf.config = { ...nf.config, ...nfConfig.config };
                nf.color = nfConfig.color;
                nf.status = 'starting';
                nf.statusTimestamp = Date.now();

                // Handle UE-specific configuration
                if (nfConfig.type === 'UE' && nfConfig.config.subscriberImsi) {
                    nf.config.subscriberImsi = nfConfig.config.subscriberImsi;
                    nf.config.subscriberKey = nfConfig.config.subscriberKey;
                    nf.config.subscriberOpc = nfConfig.config.subscriberOpc;
                    nf.config.subscriberDnn = nfConfig.config.subscriberDnn;
                    nf.config.subscriberSst = nfConfig.config.subscriberSst;
                }

                // Handle UPF tun0 interface
                if (nfConfig.type === 'UPF' && nfConfig.config.tun0Interface) {
                    nf.config.tun0Interface = nfConfig.config.tun0Interface;
                    
                    // Log tun0 interface creation
                    if (window.logEngine) {
                        window.logEngine.addLog(nf.id, 'INFO', `tun0 network interface created: ${nfConfig.config.tun0Interface.network}`, {
                            interfaceName: 'tun0',
                            network: nfConfig.config.tun0Interface.network,
                            gatewayIP: nfConfig.config.tun0Interface.gatewayIP,
                            availableIPs: `${nfConfig.config.tun0Interface.gatewayIP.replace('.1', '.2')} - ${nfConfig.config.tun0Interface.gatewayIP.replace('.1', '.14')} (13 IPs for UEs)`,
                            purpose: 'User plane data network for UE PDU sessions'
                        });
                    }
                }

                window.dataStore.updateNF(nf.id, nf);

                // Log NF creation
                if (window.logEngine) {
                    window.logEngine.addLog(nf.id, 'SUCCESS', `${nf.name} created successfully`, {
                        ipAddress: nf.config.ipAddress,
                        port: nf.config.port,
                        subnet: '192.168.1.0/24',
                        protocol: nf.config.httpProtocol,
                        status: 'starting',
                        note: 'Service will be stable in 5 seconds'
                    });
                }

                // Re-render canvas
                if (window.canvasRenderer) {
                    window.canvasRenderer.render();
                }
            }
        }

        await this.delay(500);
    }

    /**
     * Wait for NF stabilization (reduced to 1 second for faster deployment)
     * @param {Object} nfConfig - NF configuration
     */
    async waitForStabilization(nfConfig) {
        console.log(`⏳ Waiting for ${nfConfig.name} to stabilize...`);

        // Reduced stabilization period for faster deployment (1 second instead of 5)
        await this.delay(1000);

        // Update NF status to stable
        const nf = window.dataStore.getAllNFs().find(n => n.name === nfConfig.name);
        if (nf) {
            nf.status = 'stable';
            nf.statusTimestamp = Date.now();
            window.dataStore.updateNF(nf.id, nf);

            // Log stabilization
            if (window.logEngine) {
                window.logEngine.addLog(nf.id, 'SUCCESS', `${nf.name} is now STABLE and ready for connections`, {
                    Status: 'stable',
                    uptime: '1 second'
                });
            }

            // Handle NF-specific initialization logs
            await this.addNFSpecificLogs(nf, nfConfig);
        }
    }

    /**
     * Add NF-specific initialization logs based on type
     * @param {Object} nf - Network function
     * @param {Object} nfConfig - Original configuration
     */
    async addNFSpecificLogs(nf, nfConfig) {
        const logEngine = window.logEngine;
        if (!logEngine) return;

        switch (nf.type) {
            case 'NRF':
                logEngine.addLog(nf.id, 'INFO', `${nf.name} instance created: ${nf.name}`, {
                    type: 'NRF',
                    version: 'R16',
                    endpoint: `https://${nf.config.ipAddress}:${nf.config.port}/nnrf-nfm/v1`,
                    interfaces: ['Nnrf_NFManagement', 'Nnrf_NFDiscovery']
                });
                
                await this.delay(100);
                logEngine.addLog(nf.id, 'INFO', 'Initializing NF repository...', {
                    database: 'In-memory store',
                    capacity: '10000 NF profiles'
                });
                
                await this.delay(100);
                logEngine.addLog(nf.id, 'SUCCESS', 'NF repository initialized successfully', {
                    profileCount: 0,
                    status: 'Ready to accept registrations'
                });
                
                await this.delay(100);
                logEngine.addLog(nf.id, 'INFO', 'Starting HTTP/2 server...', {
                    port: nf.config.port,
                    protocol: 'HTTP/2'
                });
                
                await this.delay(100);
                logEngine.addLog(nf.id, 'SUCCESS', 'NRF HTTP/2 server started successfully', {
                    address: `${nf.config.ipAddress}:${nf.config.port}`,
                    endpoints: ['/nnrf-nfm/v1/nf-instances', '/nnrf-disc/v1/nf-instances']
                });
                
                await this.delay(100);
                logEngine.addLog(nf.id, 'SUCCESS', 'NRF is ready to accept NF registrations ✓', {
                    status: 'OPERATIONAL',
                    mode: 'FULL',
                    services: ['NFManagement', 'NFDiscovery'],
                    ready: true
                });
                break;

            case 'AMF':
                logEngine.addLog(nf.id, 'INFO', `${nf.name} instance created: ${nf.name}`, {
                    type: 'AMF',
                    version: 'R16',
                    endpoint: `https://${nf.config.ipAddress}:${nf.config.port}/namf-comm/v1`,
                    interfaces: ['Namf_Communication', 'Namf_EventExposure']
                });
                
                await this.delay(100);
                logEngine.addLog(nf.id, 'INFO', 'Initializing AMF services...', {
                    modules: ['Registration', 'Mobility', 'Authentication']
                });
                
                await this.delay(100);
                logEngine.addLog(nf.id, 'INFO', 'Initializing N2 interface toward gNodeB...', {
                    interface: 'N2',
                    protocol: 'NGAP'
                });

                // Add NRF discovery and registration
                await this.delay(100);
                const nrf = window.dataStore.getAllNFs().find(n => n.type === 'NRF');
                if (nrf) {
                    logEngine.addLog(nf.id, 'INFO', 'Discovered NRF - Initiating registration', {
                        busId: window.dataStore.getAllBuses()[0]?.id,
                        nrfId: nrf.id,
                        discoveryMethod: 'Service Bus'
                    });

                    await this.delay(200);
                    logEngine.addLog(nf.id, 'SUCCESS', 'Successfully registered with NRF ', {
                        nrfId: nrf.id,
                        validity: '3600 seconds',
                        heartbeatInterval: '60 seconds'
                    });
                }
                break;

            case 'SMF':
                logEngine.addLog(nf.id, 'INFO', `${nf.name} instance created: ${nf.name}`, {
                    type: 'SMF',
                    version: 'R16',
                    endpoint: `https://${nf.config.ipAddress}:${nf.config.port}/nsmf-pdusession/v1`,
                    interfaces: ['Nsmf_PDUSession', 'Nsmf_EventExposure']
                });
                
                await this.delay(300);
                logEngine.addLog(nf.id, 'INFO', 'Initializing SMF services...', {});
                
                await this.delay(300);
                logEngine.addLog(nf.id, 'INFO', 'Initializing N4 interface toward UPF...', {
                    interface: 'N4',
                    protocol: 'PFCP'
                });

                // Add NRF discovery and registration
                await this.delay(200);
                const nrfForSMF = window.dataStore.getAllNFs().find(n => n.type === 'NRF');
                if (nrfForSMF) {
                    logEngine.addLog(nf.id, 'INFO', 'Discovered NRF - Initiating registration', {
                        busId: window.dataStore.getAllBuses()[0]?.id,
                        nrfId: nrfForSMF.id,
                        discoveryMethod: 'Service Bus'
                    });

                    await this.delay(500);
                    logEngine.addLog(nf.id, 'SUCCESS', 'Successfully registered with NRF ', {
                        nrfId: nrfForSMF.id,
                        validity: '3600 seconds',
                        heartbeatInterval: '60 seconds'
                    });
                }
                break;

            case 'UPF':
                logEngine.addLog(nf.id, 'INFO', `${nf.name} instance created: ${nf.name}`, {
                    type: 'UPF',
                    version: 'R16',
                    endpoint: `https://${nf.config.ipAddress}:${nf.config.port}/nupf-upf/v1`,
                    interfaces: ['N3', 'N4', 'N6', 'N9']
                });
                
                await this.delay(250);
                logEngine.addLog(nf.id, 'INFO', 'Initializing UPF packet forwarding engine...', {});
                
                await this.delay(300);
                logEngine.addLog(nf.id, 'INFO', 'Initializing network interfaces...', {
                    N3: 'Toward gNodeB',
                    N4: 'Toward SMF (PFCP)',
                    N6: 'Toward Data Network (Internet)'
                });
                
                await this.delay(300);
                logEngine.addLog(nf.id, 'SUCCESS', 'Packet forwarding resources allocated', {
                    buffers: '10GB',
                    throughput: '10Gbps'
                });
                break;

            case 'AUSF':
                logEngine.addLog(nf.id, 'INFO', `${nf.name} instance created: ${nf.name}`, {
                    type: 'AUSF',
                    version: 'R16',
                    endpoint: `https://${nf.config.ipAddress}:${nf.config.port}/nausf-auth/v1`,
                    interfaces: ['Nausf_UEAuthentication', 'Nausf_SoRProtection']
                });
                
                await this.delay(300);
                logEngine.addLog(nf.id, 'INFO', 'Initializing AUSF authentication services...', {
                    modules: ['UE Authentication', 'EAP Authentication', 'Key Generation']
                });

                // Add NRF discovery and registration
                await this.delay(200);
                const nrfForAUSF = window.dataStore.getAllNFs().find(n => n.type === 'NRF');
                if (nrfForAUSF) {
                    logEngine.addLog(nf.id, 'INFO', 'Discovered NRF - Initiating registration', {
                        busId: window.dataStore.getAllBuses()[0]?.id,
                        nrfId: nrfForAUSF.id,
                        discoveryMethod: 'Service Bus'
                    });

                    await this.delay(500);
                    logEngine.addLog(nf.id, 'SUCCESS', 'Successfully registered with NRF ', {
                        nrfId: nrfForAUSF.id,
                        validity: '3600 seconds',
                        heartbeatInterval: '60 seconds'
                    });
                }

                // Add discovery notifications to other NFs
                await this.delay(200);
                const amf = window.dataStore.getAllNFs().find(n => n.type === 'AMF');
                if (amf) {
                    logEngine.addLog(amf.id, 'SUCCESS', `Discovered new AUSF ${nf.name} via Service Bus`, {
                        busId: window.dataStore.getAllBuses()[0]?.id,
                        discoveredNfId: nf.id,
                        discoveryMethod: 'Service Bus',
                        interface: 'Nausf'
                    });
                }
                break;

            case 'UDM':
                logEngine.addLog(nf.id, 'INFO', `${nf.name} instance created: ${nf.name}`, {
                    type: 'UDM',
                    version: 'R16',
                    endpoint: `https://${nf.config.ipAddress}:${nf.config.port}/nudm-sdm/v1`,
                    interfaces: ['Nudm_SDM', 'Nudm_UECM', 'Nudm_Authentication', 'Nudm_EventExposure']
                });
                
                await this.delay(300);
                logEngine.addLog(nf.id, 'INFO', 'Initializing UDM subscription data management...', {
                    modules: ['Subscription Management', 'UE Context Management', 'Authentication Credentials']
                });

                // Add NRF discovery and registration
                await this.delay(200);
                const nrfForUDM = window.dataStore.getAllNFs().find(n => n.type === 'NRF');
                if (nrfForUDM) {
                    logEngine.addLog(nf.id, 'INFO', 'Discovered NRF - Initiating registration', {
                        busId: window.dataStore.getAllBuses()[0]?.id,
                        nrfId: nrfForUDM.id,
                        discoveryMethod: 'Service Bus'
                    });

                    await this.delay(300);
                    logEngine.addLog(nf.id, 'WARNING', 'MySQL database not available - Using in-memory storage', {
                        code: 'UDM_WARN_001',
                        impact: 'Data will not persist across restarts'
                    });

                    await this.delay(500);
                    logEngine.addLog(nf.id, 'SUCCESS', 'Successfully registered with NRF ', {
                        nrfId: nrfForUDM.id,
                        validity: '3600 seconds',
                        heartbeatInterval: '60 seconds'
                    });
                }

                // Add discovery notifications to other NFs
                await this.delay(200);
                const smf = window.dataStore.getAllNFs().find(n => n.type === 'SMF');
                const amfForUDM = window.dataStore.getAllNFs().find(n => n.type === 'AMF');
                const ausf = window.dataStore.getAllNFs().find(n => n.type === 'AUSF');

                if (smf) {
                    logEngine.addLog(smf.id, 'SUCCESS', `Discovered new UDM ${nf.name} via Service Bus`, {
                        busId: window.dataStore.getAllBuses()[0]?.id,
                        discoveredNfId: nf.id,
                        discoveryMethod: 'Service Bus',
                        interface: 'Nudm'
                    });
                }

                if (amfForUDM) {
                    await this.delay(300);
                    logEngine.addLog(amfForUDM.id, 'SUCCESS', `Discovered new UDM ${nf.name} via Service Bus`, {
                        busId: window.dataStore.getAllBuses()[0]?.id,
                        discoveredNfId: nf.id,
                        discoveryMethod: 'Service Bus',
                        interface: 'Nudm'
                    });
                }

                if (ausf) {
                    await this.delay(300);
                    logEngine.addLog(ausf.id, 'SUCCESS', `Discovered new UDM ${nf.name} via Service Bus`, {
                        busId: window.dataStore.getAllBuses()[0]?.id,
                        discoveredNfId: nf.id,
                        discoveryMethod: 'Service Bus',
                        interface: 'Nudm'
                    });
                }
                break;

            case 'PCF':
                logEngine.addLog(nf.id, 'INFO', `${nf.name} instance created: ${nf.name}`, {
                    type: 'PCF',
                    version: 'R16',
                    endpoint: `https://${nf.config.ipAddress}:${nf.config.port}/npcf-am-policy/v1`,
                    interfaces: ['Npcf_AMPolicyControl', 'Npcf_SMPolicyControl', 'Npcf_PolicyAuthorization']
                });

                // Add NRF discovery and registration
                await this.delay(200);
                const nrfForPCF = window.dataStore.getAllNFs().find(n => n.type === 'NRF');
                if (nrfForPCF) {
                    logEngine.addLog(nf.id, 'INFO', 'Discovered NRF - Initiating registration', {
                        busId: window.dataStore.getAllBuses()[0]?.id,
                        nrfId: nrfForPCF.id,
                        discoveryMethod: 'Service Bus'
                    });

                    await this.delay(500);
                    logEngine.addLog(nf.id, 'SUCCESS', 'Successfully registered with NRF ', {
                        nrfId: nrfForPCF.id,
                        validity: '3600 seconds',
                        heartbeatInterval: '60 seconds'
                    });
                }
                break;

            case 'ext-dn':
                logEngine.addLog(nf.id, 'INFO', `ext-dn instance created: ${nf.name}`, {});
                
                await this.delay(300);
                logEngine.addLog(nf.id, 'INFO', 'Initializing ext-dn services...', {});

                // Add UPF auto-start log
                const upf = window.dataStore.getAllNFs().find(n => n.type === 'UPF');
                if (upf) {
                    logEngine.addLog(upf.id, 'INFO', 'External data network (ext-dn) auto-started for UPF', {
                        extDNName: nf.name,
                        extDNId: nf.id,
                        extDNIP: nf.config.ipAddress,
                        extDNPort: nf.config.port,
                        subnet: '192.168.1.0/24',
                        purpose: 'Internet traffic flow through UPF',
                        note: 'ext-dn will auto-connect to UPF when stable (in ~5 seconds)',
                        lifecycle: 'ext-dn created → starting → stable (5s) → auto-connect to UPF'
                    });
                }
                break;
        }
    }

    /**
     * Create bus connection
     * @param {Object} busConnConfig - Bus connection configuration
     * @param {Object} topology - Full topology
     */
    async createBusConnection(busConnConfig, topology) {
        console.log(`🔗 Creating bus connection for ${busConnConfig.nfId}...`);

        const nf = window.dataStore.getAllNFs().find(n => 
            topology.nfs.find(tnf => tnf.id === busConnConfig.nfId)?.name === n.name
        );
        const bus = window.dataStore.getAllBuses()[0]; // Assuming single service bus

        if (nf && bus && window.busManager) {
            const connection = window.busManager.connectNFToBus(nf.id, bus.id);
            
            if (connection) {
                // Log bus connection
                if (window.logEngine) {
                    window.logEngine.addLog(nf.id, 'SUCCESS', `Connected to Service Bus ${bus.name}`, {
                        busId: bus.id,
                        orientation: bus.orientation,
                        protocol: 'HTTP/2'
                    });

                    await this.delay(100);
                    
                    window.logEngine.addLog(nf.id, 'INFO', `Auto-connected to Service Bus ${bus.name}`, {
                        busId: bus.id,
                        interfaceName: busConnConfig.interfaceName,
                        autoConnect: true
                    });
                }
            }
        }

        await this.delay(200);
    }

    /**
     * Create interface connection
     * @param {Object} connConfig - Connection configuration
     * @param {Object} topology - Full topology
     */
    async createInterfaceConnection(connConfig, topology) {
        console.log(`🔗 Creating interface connection: ${connConfig.interfaceName}...`);

        // Find source and target NFs by matching topology IDs to current NFs
        const sourceTopologyNF = topology.nfs.find(nf => nf.id === connConfig.sourceId);
        const targetTopologyNF = topology.nfs.find(nf => nf.id === connConfig.targetId);

        if (!sourceTopologyNF || !targetTopologyNF) return;

        const sourceNF = window.dataStore.getAllNFs().find(nf => nf.name === sourceTopologyNF.name);
        const targetNF = window.dataStore.getAllNFs().find(nf => nf.name === targetTopologyNF.name);

        if (sourceNF && targetNF && window.connectionManager) {
            const connection = window.connectionManager.createManualConnection(sourceNF.id, targetNF.id);
            
            if (connection) {
                // Update connection with topology properties
                connection.interfaceName = connConfig.interfaceName;
                connection.protocol = connConfig.protocol;
                connection.status = connConfig.status;
                connection.isManual = connConfig.isManual;
                connection.showVisual = connConfig.showVisual;

                window.dataStore.updateConnection(connection.id, connection);

                // Log connection creation with specific interface details
                if (window.logEngine) {
                    // Special handling for UPF-SMF N4 connection
                    if (connConfig.interfaceName === 'N4' && sourceNF.type === 'UPF' && targetNF.type === 'SMF') {
                        window.logEngine.addLog(sourceNF.id, 'INFO', `Initiating N4 connection to ${targetNF.name}`, {
                            protocol: 'HTTP/2',
                            targetIP: targetNF.config.ipAddress,
                            targetPort: targetNF.config.port
                        });

                        await this.delay(100);

                        window.logEngine.addLog(targetNF.id, 'INFO', `Incoming connection request from ${sourceNF.name}`, {
                            interface: 'N4',
                            sourceIP: sourceNF.config.ipAddress
                        });

                        await this.delay(100);

                        window.logEngine.addLog(sourceNF.id, 'SUCCESS', `Auto-connected to ${targetNF.name} (interface: N4)`, {
                            targetType: 'SMF',
                            interface: 'N4',
                            autoConnection: true,
                            visualConnection: true,
                            subnet: '192.168.1.0/24',
                            sourceIP: sourceNF.config.ipAddress,
                            targetIP: targetNF.config.ipAddress,
                            reason: '5G architecture requirement + subnet restriction',
                            note: 'Visual interface connection established and shown on canvas'
                        });

                        // Add TLS handshake simulation
                        await this.delay(300);
                        window.logEngine.addLog(sourceNF.id, 'INFO', 'TLS handshake in progress...', {});
                        window.logEngine.addLog(targetNF.id, 'INFO', 'Accepting TLS connection...', {});

                        await this.delay(400);
                        window.logEngine.addLog(sourceNF.id, 'SUCCESS', 'TLS handshake complete', {});
                        window.logEngine.addLog(targetNF.id, 'SUCCESS', 'TLS session established', {});

                        await this.delay(300);
                        window.logEngine.addLog(sourceNF.id, 'INFO', 'HTTP/2 connection upgrade...', {});

                        await this.delay(500);
                        window.logEngine.addLog(sourceNF.id, 'SUCCESS', `N4 connection established with ${targetNF.name}`, {
                            endpoint: `https://${sourceNF.config.ipAddress}:${sourceNF.config.port}/nupf-upf/v1`,
                            protocol: 'HTTP/2',
                            status: 'ACTIVE'
                        });

                        window.logEngine.addLog(targetNF.id, 'SUCCESS', `N4 connection active from ${sourceNF.name}`, {});

                        // SMF becomes fully operational
                        await this.delay(500);
                        window.logEngine.addLog(targetNF.id, 'SUCCESS', 'All dependencies satisfied - SMF is now fully operational ✓', {
                            status: 'OPERATIONAL',
                            mode: 'FULL',
                            timestamp: new Date().toISOString()
                        });
                    }
                }
            }
        }

        await this.delay(300);
    }

    /**
     * Complete deployment with final steps
     */
    async completeDeployment() {
        console.log('🎯 Completing deployment...');

        // Add final system logs
        if (window.logEngine) {
            window.logEngine.addLog('system', 'SUCCESS', '5G Network Deployment Completed Successfully', {
                totalNFs: window.dataStore.getAllNFs().length,
                totalConnections: window.dataStore.getAllConnections().length,
                totalBuses: window.dataStore.getAllBuses().length,
                deploymentTime: new Date().toISOString(),
                status: 'OPERATIONAL'
            });
        }

        // Final canvas render
        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }

        await this.delay(1000);
    }

    /**
     * Update deployment progress
     */
    updateProgress() {
        this.currentStep++;
        this.deploymentProgress = (this.currentStep / this.totalSteps) * 100;
        
        console.log(`📊 Deployment progress: ${Math.round(this.deploymentProgress)}% (${this.currentStep}/${this.totalSteps})`);
        
        // Update progress bar if exists
        const progressBar = document.getElementById('deployment-progress-bar');
        const progressText = document.getElementById('deployment-progress-text');
        
        if (progressBar) {
            progressBar.style.width = `${this.deploymentProgress}%`;
        }
        
        if (progressText) {
            progressText.textContent = `${Math.round(this.deploymentProgress)}% (${this.currentStep}/${this.totalSteps})`;
        }
    }

    /**
     * Update deployment UI
     * @param {boolean} isDeploying - Whether deployment is in progress
     */
    updateDeploymentUI(isDeploying) {
        const deployBtn = document.getElementById('btn-one-click-deploy');
        const progressContainer = document.getElementById('deployment-progress');
        
        if (deployBtn) {
            deployBtn.disabled = isDeploying;
            deployBtn.textContent = isDeploying ? '🚀 Deploying...' : '🚀 One-Click Deploy';
        }
        
        // Hide progress bar - don't show deployment progress
        if (progressContainer) {
            progressContainer.style.display = 'none';
        }
    }

    /**
     * Utility function to add delay
     * @param {number} ms - Milliseconds to delay
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize deployment manager
window.deploymentManager = new DeploymentManager();