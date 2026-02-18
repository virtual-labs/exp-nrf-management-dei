/**
 * ============================================
 * CONNECTION MANAGER
 * ============================================
 * Manages connections between Network Functions
 * 
 * Responsibilities:
 * - Create connections between NFs
 * - Validate connections (3GPP compliance)
 * - Determine interface names
 * - Delete connections
 * - Check connection validity
 */

class ConnectionManager {
    constructor() {
        // Valid connections based on 3GPP specs
        this.validConnections = this.initializeValidConnections();

        console.log('✅ ConnectionManager initialized');
    }

    /**
     * Initialize valid 3GPP connections
     * Defines which NF types can connect to which
     * @returns {Object} Valid connection mappings
     */
    initializeValidConnections() {
        return {
            // NRF can connect to all NFs (for registration)
            'NRF': ['AMF', 'SMF', 'UPF', 'AUSF', 'UDM', 'PCF', 'NSSF', 'UDR'],

            // AMF connections
            'AMF': ['NRF', 'SMF', 'AUSF', 'UDM', 'PCF', 'NSSF', 'gNB', 'UE'],

            // SMF connections
            'SMF': ['NRF', 'AMF', 'UPF', 'PCF', 'UDM', 'UDR'],

            // UPF connections
            'UPF': ['NRF', 'SMF', 'gNB'],

            // AUSF connections
            'AUSF': ['NRF', 'AMF', 'UDM'],

            // UDM connections
            'UDM': ['NRF', 'AMF', 'SMF', 'AUSF', 'PCF', 'UDR'],

            // PCF connections
            'PCF': ['NRF', 'AMF', 'SMF', 'UDM'],

            // NSSF connections
            'NSSF': ['NRF', 'AMF'],

            // UDR connections
            'UDR': ['NRF', 'SMF', 'UDM', 'MySQL'],

            // NEW CONNECTIONS
            'gNB': ['AMF', 'UPF', 'UE'],
            'UE': ['gNB', 'AMF'],
            'MySQL': ['UDR'],
            'ext-dn': ['UPF']
        };
    }

    /**
     * Create a connection between two NFs with subnet restrictions
     * @param {string} sourceId - Source NF ID
     * @param {string} targetId - Target NF ID
     * @param {boolean} isManual - True if manually created by user, false if auto-created
     * @returns {Object|null} Created connection or null if invalid
     */
    createConnection(sourceId, targetId, isManual = true) {
        console.log('🔗 Creating connection:', sourceId, '→', targetId);

        // Get both NFs
        const sourceNF = window.dataStore.getNFById(sourceId);
        const targetNF = window.dataStore.getNFById(targetId);

        if (!sourceNF || !targetNF) {
            console.error('❌ Invalid NF IDs');
            return null;
        }

        // Prevent self-connection
        if (sourceId === targetId) {
            alert('Cannot connect an NF to itself');
            return null;
        }

     

        // NEW: Check subnet restriction - NFs can only connect within same subnet
        const sourceNetwork = this.getNetworkFromIP(sourceNF.config.ipAddress);
        const targetNetwork = this.getNetworkFromIP(targetNF.config.ipAddress);
        
        if (sourceNetwork !== targetNetwork) {
            alert(`❌ Subnet Restriction!\n\n` +
                  `${sourceNF.name} (${sourceNF.config.ipAddress}) is in subnet ${sourceNetwork}.0/24\n` +
                  `${targetNF.name} (${targetNF.config.ipAddress}) is in subnet ${targetNetwork}.0/24\n\n` +
                  `Network Functions can only connect within the same subnet.\n\n` +
                  `Please move one of the services to the same subnet to establish connection.`);
            
            // Log the restriction
            if (window.logEngine) {
                window.logEngine.addLog(sourceId, 'ERROR',
                    `Connection blocked: Cross-subnet communication not allowed`, {
                    sourceNF: sourceNF.name,
                    sourceIP: sourceNF.config.ipAddress,
                    sourceSubnet: sourceNetwork + '.0/24',
                    targetNF: targetNF.name,
                    targetIP: targetNF.config.ipAddress,
                    targetSubnet: targetNetwork + '.0/24',
                    restriction: 'Same-subnet communication only',
                    solution: 'Move services to same subnet'
                });
            }
            
            return null;
        }

        // Validate connection is allowed (3GPP compliance)
        if (!this.isConnectionValid(sourceNF.type, targetNF.type)) {
            alert(`Invalid connection: ${sourceNF.type} cannot connect to ${targetNF.type}\n\nPer 3GPP specifications, this connection is not allowed.`);
            return null;
        }

        // Determine interface name
        const interfaceName = this.getInterfaceName(sourceNF.type, targetNF.type);

        // Use global HTTP protocol
        const protocol = window.globalHTTPProtocol || 'HTTP/2';

        // Create connection object
        const connection = {
            id: this.generateConnectionId(),
            sourceId: sourceId,
            targetId: targetId,
            interfaceName: interfaceName,
            protocol: protocol,  // Use global protocol
            status: 'connected',
            createdAt: Date.now(),
            isManual: isManual,  // NEW: Track if connection is manual or auto
            showVisual: true  // Show visual line for all connections (manual and auto)
        };

        console.log('✅ Connection created:', connection);

        // Add to data store
        window.dataStore.addConnection(connection);

        // Trigger log engine
        if (window.logEngine) {
            window.logEngine.onConnectionCreated(connection);
        }

        // --- ADDED: NRF Registration when NF connects to NRF ---
        if (targetNF.type === 'NRF' && sourceNF.type !== 'NRF') {
            // NF is connecting to NRF - register it
            setTimeout(() => {
                if (window.nrfRegistry) {
                    const nfProfile = {
                        nfType: sourceNF.type,
                        nfName: sourceNF.name,
                        ipAddress: sourceNF.config.ipAddress,
                        port: sourceNF.config.port,
                        httpProtocol: sourceNF.config.httpProtocol || 'HTTP/2',
                        services: this.getServicesForNF(sourceNF.type)
                    };
                    
                    window.nrfRegistry.registerNF(sourceNF.id, nfProfile);
                    
                    // Start heartbeat for this NF
                    this.startNFHeartbeat(sourceNF.id);
                }
            }, 1500); // Delay to allow connection logs to complete
        } else if (sourceNF.type === 'NRF' && targetNF.type !== 'NRF') {
            // NRF is connecting to NF - register the NF
            setTimeout(() => {
                if (window.nrfRegistry) {
                    const nfProfile = {
                        nfType: targetNF.type,
                        nfName: targetNF.name,
                        ipAddress: targetNF.config.ipAddress,
                        port: targetNF.config.port,
                        httpProtocol: targetNF.config.httpProtocol || 'HTTP/2',
                        services: this.getServicesForNF(targetNF.type)
                    };
                    
                    window.nrfRegistry.registerNF(targetNF.id, nfProfile);
                    
                    // Start heartbeat for this NF
                    this.startNFHeartbeat(targetNF.id);
                }
            }, 1500);
        }

        // NEW: Create tun0 interface when UPF connects to ext-dn
        if ((sourceNF.type === 'UPF' && targetNF.type === 'ext-dn') || 
            (sourceNF.type === 'ext-dn' && targetNF.type === 'UPF')) {
            
            const upf = sourceNF.type === 'UPF' ? sourceNF : targetNF;
            
            console.log('🌐 UPF-ext-dn connection detected, creating tun0 interface...');
            
            // Create or update tun0 interface configuration
            if (!upf.config.tun0Interface) {
                upf.config.tun0Interface = {
                    name: 'tun0',
                    ipAddress: '10.0.0.1',
                    netmask: '255.255.255.0',
                    network: '10.0.0.0/24',
                    gatewayIP: '10.0.0.1',
                    assignedIPs: [], // Track IPs assigned to UEs
                    nextAvailableIP: 2, // Next IP to assign (10.0.0.2)
                    createdAt: Date.now()
                };
            } else {
                // Update existing interface to ensure it has all required properties
                if (!upf.config.tun0Interface.assignedIPs) {
                    upf.config.tun0Interface.assignedIPs = [];
                }
                if (!upf.config.tun0Interface.nextAvailableIP) {
                    upf.config.tun0Interface.nextAvailableIP = 2;
                }
                if (!upf.config.tun0Interface.name) {
                    upf.config.tun0Interface.name = 'tun0';
                }
                if (!upf.config.tun0Interface.ipAddress) {
                    upf.config.tun0Interface.ipAddress = '10.0.0.1';
                }
                if (!upf.config.tun0Interface.netmask) {
                    upf.config.tun0Interface.netmask = '255.255.255.0';
                }
            }
            
            window.dataStore.updateNF(upf.id, upf);
            
            console.log('✅ tun0 interface ready on UPF:', upf.config.tun0Interface);
            
            // Log interface creation
            if (window.logEngine) {
                window.logEngine.addLog(upf.id, 'SUCCESS',
                    'Network interface tun0 created', {
                    interface: 'tun0',
                    ipAddress: '10.0.0.1',
                    netmask: '255.255.255.0',
                    network: '10.0.0.0/24',
                });
            }
        }

        // NEW: Trigger NAS signaling when UE and AMF are connected
        if ((sourceNF.type === 'UE' && targetNF.type === 'AMF') || 
            (sourceNF.type === 'AMF' && targetNF.type === 'UE')) {
            
            const ue = sourceNF.type === 'UE' ? sourceNF : targetNF;
            const amf = sourceNF.type === 'AMF' ? sourceNF : targetNF;
            
            console.log('📱 UE-AMF connection detected, triggering NAS signaling...');
            
            // Trigger NAS signaling after a short delay
            setTimeout(() => {
                if (window.logEngine && typeof window.logEngine.simulateNASRegistration === 'function') {
                    const params = {
                        imsi: ue.config.subscriberImsi || '001010000000101',
                        dnn: ue.config.subscriberDnn || '5G-Lab',
                        nssai_sst: ue.config.subscriberSst || 1
                    };
                    
                    window.logEngine.simulateNASRegistration(ue, amf, params);
                    
                    console.log('✅ NAS signaling triggered for UE-AMF connection');
                }
            }, 1000); // 1 second delay after connection
        }

        // Re-render canvas
        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }

        return connection;
    }

    /**
     * Generate unique connection ID
     * @returns {string} Unique connection ID
     */
    generateConnectionId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 5);
        return `conn-${timestamp}-${random}`;
    }

    /**
     * Validate if connection is allowed between two NF types
     * @param {string} sourceType - Source NF type
     * @param {string} targetType - Target NF type
     * @returns {boolean} True if connection is valid
     */
    isConnectionValid(sourceType, targetType) {
        // Check if source type has valid connections defined
        if (!this.validConnections[sourceType]) {
            return false;
        }

        // Check if target is in the list of valid connections
        if (this.validConnections[sourceType].includes(targetType)) {
            return true;
        }

        // Check reverse direction
        if (this.validConnections[targetType] &&
            this.validConnections[targetType].includes(sourceType)) {
            return true;
        }

        return false;
    }

    /**
     * Get 3GPP interface name for connection
     * @param {string} sourceType - Source NF type
     * @param {string} targetType - Target NF type
     * @returns {string} Interface name (e.g., "Nnrf_NFManagement")
     */
    getInterfaceName(sourceType, targetType) {
        // Define 3GPP interface names
        const interfaces = {
            // NRF interfaces
            'AMF-NRF': 'Nnrf_NFManagement',
            'SMF-NRF': 'Nnrf_NFDiscovery',
            'UPF-NRF': 'Nnrf_NFManagement',
            'AUSF-NRF': 'Nnrf_NFManagement',
            'UDM-NRF': 'Nnrf_NFManagement',
            'PCF-NRF': 'Nnrf_NFManagement',
            'NSSF-NRF': 'Nnrf_NFManagement',
            'UDR-NRF': 'Nnrf_NFManagement',

            // AMF interfaces
            'AMF-SMF': 'Namf_Communication',
            'AMF-AUSF': 'Nausf_UEAuthentication',
            'AMF-UDM': 'Nudm_UECM',
            'AMF-PCF': 'Npcf_AMPolicyControl',
            'AMF-NSSF': 'Nnssf_NSSelection',
            'AMF-UE': 'N1',

            // SMF interfaces
            'SMF-UPF': 'N4',
            'SMF-PCF': 'Npcf_SMPolicyControl',
            'SMF-UDM': 'Nudm_SDM',
            'SMF-UDR': 'Nudr_EventExposure',

            // AUSF interfaces
            'AUSF-UDM': 'Nudm_Authentication',

            // PCF interfaces
            'PCF-UDM': 'Nudm_PolicyControl',

            // NEW INTERFACES
            'gNB-AMF': 'N2',
            'gNB-UPF': 'N3',
            'gNB-UE': 'Radio',
            'UE-gNB': 'Radio',
            'UE-AMF': 'N1',  // UE to AMF (reverse direction)

            'UDM-UDR': 'Nudr_DataRepository',
            'UDR-UDM': 'Nudr_DataRepository',
            'UDR-MySQL': 'SQL/REST API',
            'MySQL-UDR': 'SQL/REST API',
            'UPF-ext-dn': 'N6',
            'ext-dn-UPF': 'N6'
        };

        // Try forward direction
        const key1 = `${sourceType}-${targetType}`;
        if (interfaces[key1]) {
            return interfaces[key1];
        }

        // Try reverse direction
        const key2 = `${targetType}-${sourceType}`;
        if (interfaces[key2]) {
            return interfaces[key2];
        }

        // Default SBI interface
        return 'SBI';
    }

    /**
     * Delete a connection
     * @param {string} connectionId - Connection ID to delete
     */
    deleteConnection(connectionId) {
        const connection = window.dataStore.getConnectionById(connectionId);

        if (!connection) {
            console.warn('⚠️ Connection not found:', connectionId);
            return;
        }

        console.log('🗑️ Deleting connection:', connectionId);

        // --- ADDED: Handle NRF deregistration if connection to NRF is removed ---
        const sourceNF = window.dataStore?.getNFById(connection.sourceId);
        const targetNF = window.dataStore?.getNFById(connection.targetId);
        
        if (sourceNF && targetNF) {
            // If NF is disconnecting from NRF, deregister it
            if (targetNF.type === 'NRF' && sourceNF.type !== 'NRF') {
                if (window.nrfRegistry) {
                    window.nrfRegistry.deregisterNF(sourceNF.id, 'NRF_CONNECTION_REMOVED');
                }
                if (window.connectionManager) {
                    window.connectionManager.stopNFHeartbeat(sourceNF.id);
                }
            } else if (sourceNF.type === 'NRF' && targetNF.type !== 'NRF') {
                if (window.nrfRegistry) {
                    window.nrfRegistry.deregisterNF(targetNF.id, 'NRF_CONNECTION_REMOVED');
                }
                if (window.connectionManager) {
                    window.connectionManager.stopNFHeartbeat(targetNF.id);
                }
            }
        }

        // Trigger log engine
        if (window.logEngine) {
            window.logEngine.onConnectionDeleted(connection);
        }

        // Remove from data store
        window.dataStore.removeConnection(connectionId);

        // Re-render canvas
        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }
    }

    /**
     * Get all valid connection targets for a given NF
     * @param {string} nfId - Source NF ID
     * @returns {Array} Array of valid target NF IDs
     */
    getValidTargets(nfId) {
        const sourceNF = window.dataStore.getNFById(nfId);
        if (!sourceNF) return [];

        const allNFs = window.dataStore.getAllNFs();
        const validTargets = [];

        allNFs.forEach(nf => {
            if (nf.id !== nfId && this.isConnectionValid(sourceNF.type, nf.type)) {
                validTargets.push(nf);
            }
        });

        return validTargets;
    }

    /**
     * Get network from IP address (for subnet checking)
     * @param {string} ip - IP address
     * @returns {string} Network address (e.g., "192.168.1")
     */
    getNetworkFromIP(ip) {
        const parts = ip.split('.');
        return `${parts[0]}.${parts[1]}.${parts[2]}`;
    }

    /**
     * Check if two IPs are in the same subnet
     * @param {string} ip1 - First IP address
     * @param {string} ip2 - Second IP address
     * @returns {boolean} True if in same subnet
     */
    areIPsInSameSubnet(ip1, ip2) {
        return this.getNetworkFromIP(ip1) === this.getNetworkFromIP(ip2);
    }

    /**
     * Get all valid connection targets for a given NF (same subnet only)
     * @param {string} nfId - Source NF ID
     * @returns {Array} Array of valid target NF IDs in same subnet
     */
    getValidTargetsInSameSubnet(nfId) {
        const sourceNF = window.dataStore.getNFById(nfId);
        if (!sourceNF) return [];

        const allNFs = window.dataStore.getAllNFs();
        const sourceNetwork = this.getNetworkFromIP(sourceNF.config.ipAddress);
        const validTargets = [];

        allNFs.forEach(nf => {
            if (nf.id !== nfId && 
                this.isConnectionValid(sourceNF.type, nf.type) &&
                this.getNetworkFromIP(nf.config.ipAddress) === sourceNetwork) {
                validTargets.push(nf);
            }
        });

        return validTargets;
    }

    /**
     * Create a manual connection (with visual line) - called by UI
     * @param {string} sourceId - Source NF ID
     * @param {string} targetId - Target NF ID
     * @returns {Object|null} Created connection or null if invalid
     */
    createManualConnection(sourceId, targetId) {
        console.log('🖱️ Creating MANUAL connection (with visual line):', sourceId, '→', targetId);
        return this.createConnection(sourceId, targetId, true); // isManual = true
    }

    /**
     * Create an auto connection (no visual line) - called by system
     * @param {string} sourceId - Source NF ID
     * @param {string} targetId - Target NF ID
     * @returns {Object|null} Created connection or null if invalid
     */
    createAutoConnection(sourceId, targetId) {
        console.log('🤖 Creating AUTO connection (logical only, no visual line):', sourceId, '→', targetId);
        return this.createConnection(sourceId, targetId, false); // isManual = false
    }

    /**
     * Get connection statistics with subnet information
     * @returns {Object} Connection statistics
     */
    getConnectionStats() {
        const connections = window.dataStore.getAllConnections();
        const allNFs = window.dataStore.getAllNFs();

        // Group NFs by subnet
        const subnetGroups = {};
        allNFs.forEach(nf => {
            const subnet = this.getNetworkFromIP(nf.config.ipAddress);
            if (!subnetGroups[subnet]) {
                subnetGroups[subnet] = [];
            }
            subnetGroups[subnet].push(nf);
        });

        return {
            total: connections.length,
            byProtocol: {
                'HTTP/2': connections.filter(c => c.protocol === 'HTTP/2').length,
                'HTTP/1': connections.filter(c => c.protocol === 'HTTP/1').length
            },
            byStatus: {
                connected: connections.filter(c => c.status === 'connected').length,
                disconnected: connections.filter(c => c.status === 'disconnected').length
            },
            subnetInfo: {
                totalSubnets: Object.keys(subnetGroups).length,
                subnets: Object.keys(subnetGroups).map(subnet => ({
                    network: subnet + '.0/24',
                    nfCount: subnetGroups[subnet].length,
                    nfs: subnetGroups[subnet].map(nf => ({
                        name: nf.name,
                        type: nf.type,
                        ip: nf.config.ipAddress
                    }))
                }))
            }
        };
    }

    /**
     * --- ADDED: Get Services for NF Type ---
     * Returns service names for a given NF type (3GPP-aligned)
     * @param {string} nfType - NF type
     * @returns {Array} Array of service objects
     */
    getServicesForNF(nfType) {
        const serviceMap = {
            'AMF': [
                { serviceName: 'namf-comm', serviceInstanceId: 'namf-comm-v1' },
                { serviceName: 'namf-evts', serviceInstanceId: 'namf-evts-v1' }
            ],
            'SMF': [
                { serviceName: 'nsmf-pdusession', serviceInstanceId: 'nsmf-pdusession-v1' },
                { serviceName: 'nsmf-event-exposure', serviceInstanceId: 'nsmf-event-exposure-v1' }
            ],
            'UPF': [
                { serviceName: 'nupf-pfcp', serviceInstanceId: 'nupf-pfcp-v1' }
            ],
            'AUSF': [
                { serviceName: 'nausf-auth', serviceInstanceId: 'nausf-auth-v1' }
            ],
            'UDM': [
                { serviceName: 'nudm-sdm', serviceInstanceId: 'nudm-sdm-v1' },
                { serviceName: 'nudm-uecm', serviceInstanceId: 'nudm-uecm-v1' },
                { serviceName: 'nudm-ueau', serviceInstanceId: 'nudm-ueau-v1' }
            ],
            'PCF': [
                { serviceName: 'npcf-am-policy-control', serviceInstanceId: 'npcf-am-policy-control-v1' },
                { serviceName: 'npcf-smpolicycontrol', serviceInstanceId: 'npcf-smpolicycontrol-v1' }
            ],
            'NSSF': [
                { serviceName: 'nnssf-nsselection', serviceInstanceId: 'nnssf-nsselection-v1' }
            ],
            'UDR': [
                { serviceName: 'nudr-dr', serviceInstanceId: 'nudr-dr-v1' }
            ],
            'NRF': [
                { serviceName: 'nnrf-nfm', serviceInstanceId: 'nnrf-nfm-v1' },
                { serviceName: 'nnrf-disc', serviceInstanceId: 'nnrf-disc-v1' }
            ]
        };

        return serviceMap[nfType] || [];
    }

    /**
     * --- ADDED: Start Heartbeat for NF ---
     * Starts periodic heartbeat sending to NRF
     * @param {string} nfId - NF instance ID
     */
    startNFHeartbeat(nfId) {
        const nf = window.dataStore?.getNFById(nfId);
        if (!nf || nf.type === 'NRF') {
            return; // NRF doesn't send heartbeat to itself
        }

        // Check if heartbeat already started
        if (nf.heartbeatIntervalId) {
            return;
        }

        // Find NRF connection
        const connections = window.dataStore?.getConnectionsForNF(nfId) || [];
        const nrfConnection = connections.find(conn => {
            const otherNF = window.dataStore?.getNFById(
                conn.sourceId === nfId ? conn.targetId : conn.sourceId
            );
            return otherNF && otherNF.type === 'NRF';
        });

        if (!nrfConnection) {
            console.log(`ℹ️ No NRF connection found for ${nf.name} - heartbeat not started`);
            return;
        }

        // Send heartbeat every 60 seconds (3GPP default)
        const heartbeatInterval = 60000;
        
        nf.heartbeatIntervalId = setInterval(() => {
            // Check if NF still exists and is connected to NRF
            const currentNF = window.dataStore?.getNFById(nfId);
            if (!currentNF) {
                // NF was deleted, stop heartbeat
                if (nf.heartbeatIntervalId) {
                    clearInterval(nf.heartbeatIntervalId);
                }
                return;
            }

            // Send heartbeat to NRF
            if (window.nrfRegistry) {
                const success = window.nrfRegistry.updateHeartbeat(nfId);
                if (success) {
                    // Log heartbeat (only occasionally to avoid log spam)
                    if (Math.random() < 0.1) { // Log 10% of heartbeats
                        if (window.logEngine) {
                            window.logEngine.addLog(nfId, 'INFO',
                                'Heartbeat sent to NRF', {
                                heartbeatInterval: heartbeatInterval + 'ms',
                                nfStatus: 'REGISTERED'
                            });
                        }
                    }
                }
            }
        }, heartbeatInterval);

        console.log(`💓 Heartbeat started for ${nf.name} (interval: ${heartbeatInterval}ms)`);
        
        // Send initial heartbeat immediately
        if (window.nrfRegistry) {
            window.nrfRegistry.updateHeartbeat(nfId);
        }
    }

    /**
     * --- ADDED: Stop Heartbeat for NF ---
     * @param {string} nfId - NF instance ID
     */
    stopNFHeartbeat(nfId) {
        const nf = window.dataStore?.getNFById(nfId);
        if (nf && nf.heartbeatIntervalId) {
            clearInterval(nf.heartbeatIntervalId);
            nf.heartbeatIntervalId = null;
            console.log(`🛑 Heartbeat stopped for ${nf.name}`);
        }
    }
}