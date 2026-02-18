/**
 * ============================================
 * NRF REGISTRY MANAGER
 * ============================================
 * Manages NF Registration, Discovery, and Deregistration in 5G Core SBA
 * Implements 3GPP-aligned behavior for NRF functionality
 * 
 * Responsibilities:
 * - Track NF registrations with heartbeat timestamps
 * - Manage NF status transitions (REGISTERED → UNAVAILABLE → REMOVED)
 * - Provide discovery API filtering by nfStatus == REGISTERED
 * - Monitor heartbeats and handle automatic deregistration
 * 
 * --- ADDED: Heartbeat Monitor ---
 */

class NRFRegistry {
    constructor() {
        // --- ADDED: NF Registry Storage ---
        // Maps nfInstanceId -> NF Profile with registration metadata
        this.registry = new Map();
        // Store last registration request/response per NF
        this.registrationMessages = new Map();
        // Keep full history of registrations for NRF-side viewing
        this.registrationHistory = [];
        // Store last deregistration request/response per NF
        this.deregistrationMessages = new Map();
        // Keep full history of deregistrations
        this.deregistrationHistory = [];
        
        // --- ADDED: Heartbeat Configuration ---
        this.heartbeatInterval = 60000; // 60 seconds (3GPP default)
        this.heartbeatTimeout = 120000; // 120 seconds (2x interval)
        this.gracePeriod = 30000; // 30 seconds grace period before removal
        
        // --- ADDED: Background Monitor ---
        this.monitorIntervalId = null;
        this.isMonitoring = false;
        
        console.log('✅ NRFRegistry initialized');
        console.log('📋 Heartbeat config: interval=60s, timeout=120s, grace=30s');
    }

    /**
     * --- ADDED: Start Background Heartbeat Monitor ---
     * Starts periodic checking for expired heartbeats
     */
    startHeartbeatMonitor() {
        if (this.isMonitoring) {
            console.log('ℹ️ Heartbeat monitor already running');
            return;
        }

        this.isMonitoring = true;
        // Check every 10 seconds for expired heartbeats
        this.monitorIntervalId = setInterval(() => {
            this.checkHeartbeatTimeouts();
        }, 10000);

        console.log('🔄 Heartbeat monitor started (checking every 10s)');
        
        // Log initial status
        if (window.logEngine) {
            window.logEngine.addLog('system', 'INFO',
                'NRF heartbeat monitor started', {
                heartbeatInterval: this.heartbeatInterval + 'ms',
                timeout: this.heartbeatTimeout + 'ms',
                gracePeriod: this.gracePeriod + 'ms',
                checkInterval: '10s'
            });
        }
    }

    /**
     * --- ADDED: Stop Background Heartbeat Monitor ---
     */
    stopHeartbeatMonitor() {
        if (this.monitorIntervalId) {
            clearInterval(this.monitorIntervalId);
            this.monitorIntervalId = null;
            this.isMonitoring = false;
            console.log('🛑 Heartbeat monitor stopped');
        }
    }

    /**
     * --- ADDED: Check for Expired Heartbeats ---
     * Marks NFs as UNAVAILABLE if heartbeat expired, removes after grace period
     */
    checkHeartbeatTimeouts() {
        const now = Date.now();
        const toRemove = [];

        this.registry.forEach((profile, nfInstanceId) => {
            const lastHeartbeat = profile.lastHeartbeat || profile.registeredAt;
            const timeSinceHeartbeat = now - lastHeartbeat;

            // Check if heartbeat expired
            if (timeSinceHeartbeat > this.heartbeatTimeout) {
                // If still REGISTERED, mark as UNAVAILABLE
                if (profile.nfStatus === 'REGISTERED') {
                    profile.nfStatus = 'UNAVAILABLE';
                    profile.statusChangedAt = now;
                    
                    // Update NF object in data store if it exists
                    const nf = window.dataStore?.getNFById(nfInstanceId);
                    if (nf) {
                        nf.nrfStatus = 'UNAVAILABLE';
                        window.dataStore.updateNF(nfInstanceId, { nrfStatus: 'UNAVAILABLE' });
                    }

                    // Log heartbeat timeout
                    if (window.logEngine) {
                        window.logEngine.addLog(nfInstanceId, 'WARNING',
                            'Heartbeat timeout - NF marked as UNAVAILABLE', {
                            lastHeartbeat: new Date(lastHeartbeat).toISOString(),
                            timeSinceHeartbeat: Math.floor(timeSinceHeartbeat / 1000) + 's',
                            timeout: this.heartbeatTimeout + 'ms',
                            status: 'UNAVAILABLE',
                            note: 'NF will be removed after grace period if heartbeat not received'
                        });
                    }

                    console.log(`⚠️ Heartbeat timeout for ${profile.nfName || nfInstanceId} - marked UNAVAILABLE`);
                }
                // If UNAVAILABLE and grace period expired, mark for removal
                else if (profile.nfStatus === 'UNAVAILABLE') {
                    const timeSinceUnavailable = now - profile.statusChangedAt;
                    if (timeSinceUnavailable > this.gracePeriod) {
                        toRemove.push(nfInstanceId);
                    }
                }
            }
        });

        // Remove NFs after grace period
        toRemove.forEach(nfInstanceId => {
            this.deregisterNF(nfInstanceId, 'AUTOMATIC_HEARTBEAT_TIMEOUT');
        });
    }

    /**
     * --- ADDED: Register NF with NRF ---
     * @param {string} nfInstanceId - Unique NF instance ID
     * @param {Object} nfProfile - NF profile data
     * @returns {Object} Registration response
     */
    registerNF(nfInstanceId, nfProfile) {
        const now = Date.now();
        
        // Create or update NF profile in registry
        const existingProfile = this.registry.get(nfInstanceId);
        
        const profile = {
            nfInstanceId: nfInstanceId,
            nfType: nfProfile.nfType,
            nfName: nfProfile.nfName || `${nfProfile.nfType}-${nfInstanceId.slice(-6)}`,
            nfStatus: 'REGISTERED',
            heartBeatTimer: this.heartbeatInterval,
            registeredAt: existingProfile?.registeredAt || now,
            lastHeartbeat: now,
            statusChangedAt: now,
            ...nfProfile
        };

        this.registry.set(nfInstanceId, profile);

        // Update NF object in data store for UI awareness
        const nf = window.dataStore?.getNFById(nfInstanceId);
        if (nf) {
            nf.nrfStatus = 'REGISTERED';
            window.dataStore.updateNF(nfInstanceId, { nrfStatus: 'REGISTERED' });
        }

        // Log registration
        if (window.logEngine) {
            window.logEngine.addLog(nfInstanceId, 'SUCCESS',
                'NF registered with NRF', {
                nfType: nfProfile.nfType,
                nfInstanceId: nfInstanceId,
                nfStatus: 'REGISTERED',
                heartbeatInterval: this.heartbeatInterval + 'ms',
                validity: '3600 seconds',
                profileId: `profile-${nfInstanceId.slice(-9)}`
            });
        }

        console.log(`✅ NF registered: ${profile.nfName} (${nfInstanceId})`);
        
        // --- DISABLED: Automatic heartbeat monitoring ---
        // Start monitor if not already running
        // if (!this.isMonitoring) {
        //     this.startHeartbeatMonitor();
        // }
        // NOTE: Heartbeat monitoring is disabled to prevent automatic deregistration

        // Build detailed registration request/response matching 5G Core format
        const requestMessage = {
            nfInstanceId,
            nfType: nfProfile.nfType,
            nfStatus: 'REGISTERED',
            ipv4Addresses: nfProfile.ipAddress ? [nfProfile.ipAddress] : [],
            allowedNfTypes: this.getAllowedNfTypes(nfProfile.nfType),
            priority: nfProfile.priority || 0,
            capacity: nfProfile.capacity != null ? nfProfile.capacity : 100,
            load: nfProfile.load || 0,
            nfServices: this.buildNfServices(nfProfile),
            nfProfileChangesSupportInd: true
        };

        const responseMessage = {
            nfInstanceId,
            nfType: nfProfile.nfType,
            nfStatus: 'REGISTERED',
            heartBeatTimer: this.heartbeatInterval / 1000,
            nfProfileChangesInd: true
        };

        const registrationRecord = {
            nfInstanceId,
            nfType: nfProfile.nfType,
            nfName: profile.nfName,
            timestamp: now,
            request: requestMessage,
            response: responseMessage
        };

        this.registrationMessages.set(nfInstanceId, registrationRecord);
        this.registrationHistory.push(registrationRecord);

        return {
            nfInstanceId: nfInstanceId,
            nfStatus: 'REGISTERED',
            validity: 3600,
            heartbeatTimer: this.heartbeatInterval
        };
    }

    /**
     * --- ADDED: Update Heartbeat ---
     * Called when NF sends heartbeat to NRF
     * @param {string} nfInstanceId - NF instance ID
     * @returns {boolean} True if heartbeat accepted
     */
    updateHeartbeat(nfInstanceId) {
        const profile = this.registry.get(nfInstanceId);
        
        if (!profile) {
            console.warn(`⚠️ Heartbeat received for unregistered NF: ${nfInstanceId}`);
            return false;
        }

        const now = Date.now();
        profile.lastHeartbeat = now;

        // If NF was UNAVAILABLE and heartbeat received, restore to REGISTERED
        if (profile.nfStatus === 'UNAVAILABLE') {
            profile.nfStatus = 'REGISTERED';
            profile.statusChangedAt = now;
            
            // Update NF object in data store
            const nf = window.dataStore?.getNFById(nfInstanceId);
            if (nf) {
                nf.nrfStatus = 'REGISTERED';
                window.dataStore.updateNF(nfInstanceId, { nrfStatus: 'REGISTERED' });
            }

            // Log status restoration
            if (window.logEngine) {
                window.logEngine.addLog(nfInstanceId, 'SUCCESS',
                    'Heartbeat received - NF status restored to REGISTERED', {
                    previousStatus: 'UNAVAILABLE',
                    currentStatus: 'REGISTERED',
                    timeSinceLastHeartbeat: '0s'
                });
            }

            console.log(`✅ Heartbeat received - ${profile.nfName} restored to REGISTERED`);
        }

        return true;
    }

    /**
     * --- ADDED: Discover NFs ---
     * Returns only NFs with nfStatus == REGISTERED matching criteria
     * @param {Object} query - Discovery query parameters
     * @param {string} query.nfType - NF type to discover (optional)
     * @param {string} query.service - Service name to discover (optional)
     * @returns {Array} Array of matching NF profiles with REGISTERED status
     */
    discoverNFs(query = {}) {
        const results = [];
        
        this.registry.forEach((profile, nfInstanceId) => {
            // --- ADDED: Filter by nfStatus == REGISTERED ---
            if (profile.nfStatus !== 'REGISTERED') {
                return; // Skip UNAVAILABLE or REMOVED NFs
            }

            // Filter by nfType if specified
            if (query.nfType && profile.nfType !== query.nfType) {
                return;
            }

            // Filter by service if specified
            if (query.service && profile.services) {
                const hasService = profile.services.some(svc => 
                    svc.serviceInstanceId === query.service || 
                    svc.serviceName === query.service
                );
                if (!hasService) {
                    return;
                }
            }

            // Add matching profile to results
            results.push({
                nfInstanceId: profile.nfInstanceId,
                nfType: profile.nfType,
                nfName: profile.nfName,
                nfStatus: profile.nfStatus,
                ...profile
            });
        });

        // Log discovery request
        if (window.logEngine && query.nfType) {
            window.logEngine.addLog('system', 'INFO',
                `NF Discovery request: ${query.nfType}`, {
                query: query,
                resultsCount: results.length,
                filter: 'nfStatus == REGISTERED only'
            });
        }

        return results;
    }

    /**
     * --- ADDED: Deregister NF ---
     * @param {string} nfInstanceId - NF instance ID
     * @param {string} reason - Deregistration reason
     */
    deregisterNF(nfInstanceId, reason = 'MANUAL') {
        const profile = this.registry.get(nfInstanceId);
        
        if (!profile) {
            console.warn(`⚠️ Attempted to deregister non-existent NF: ${nfInstanceId}`);
            return;
        }

        // Update status to REMOVED
        profile.nfStatus = 'REMOVED';
        profile.statusChangedAt = Date.now();
        profile.deregisteredAt = Date.now();
        profile.deregistrationReason = reason;

        // --- ADDED: Make NF unstable when deregistered ---
        const nf = window.dataStore?.getNFById(nfInstanceId);
        if (nf) {
            nf.nrfStatus = 'REMOVED';
            nf.status = 'unstable'; // Change status to unstable
            window.dataStore.updateNF(nfInstanceId, { 
                nrfStatus: 'REMOVED',
                status: 'unstable'
            });
            
            // Re-render canvas to show red status
            if (window.canvasRenderer) {
                window.canvasRenderer.render();
            }
            
            console.log(`⚠️ ${nf.name} marked as UNSTABLE due to NRF deregistration`);
        }

        // Build deregistration request/response for UI display
        const deregRequest = {
            nfInstanceId,
            nfType: profile.nfType,
            action: 'DEREGISTER',
            reason: reason,
            timestamp: new Date().toISOString()
        };

        const deregResponse = {
            nfInstanceId,
            nfType: profile.nfType,
            nfStatus: 'REMOVED',
            result: 'DEREGISTERED',
            deregisteredAt: new Date().toISOString()
        };

        const deregRecord = {
            nfInstanceId,
            nfType: profile.nfType,
            nfName: profile.nfName,
            timestamp: Date.now(),
            request: deregRequest,
            response: deregResponse
        };

        this.deregistrationMessages.set(nfInstanceId, deregRecord);
        this.deregistrationHistory.push(deregRecord);

        // Log deregistration
        if (window.logEngine) {
            const logLevel = reason === 'AUTOMATIC_HEARTBEAT_TIMEOUT' ? 'WARNING' : 'INFO';
            window.logEngine.addLog(nfInstanceId, logLevel,
                `NF deregistered from NRF`, {
                reason: reason,
                previousStatus: 'REGISTERED',
                currentStatus: 'REMOVED',
                deregisteredAt: new Date().toISOString()
            });
        }

        console.log(`🗑️ NF deregistered: ${profile.nfName} (${nfInstanceId}) - Reason: ${reason}`);

        // --- ADDED: Start periodic logging for deregistered NF ---
        this.startDeregisteredNFMonitoring(nfInstanceId, profile);

        // Remove from registry after a short delay (to allow logs to be processed)
        setTimeout(() => {
            this.registry.delete(nfInstanceId);
            console.log(`✅ NF removed from registry: ${nfInstanceId}`);
        }, 5000);
    }

    /**
     * --- ADDED: Get NF Profile ---
     * @param {string} nfInstanceId - NF instance ID
     * @returns {Object|null} NF profile or null
     */
    getNFProfile(nfInstanceId) {
        return this.registry.get(nfInstanceId) || null;
    }

    /**
     * --- ADDED: Get All Registered NFs ---
     * @returns {Array} All NF profiles
     */
    getAllRegisteredNFs() {
        return Array.from(this.registry.values());
    }

    /**
     * --- ADDED: Get Registry Statistics ---
     * @returns {Object} Registry statistics
     */
    getStatistics() {
        const stats = {
            total: this.registry.size,
            registered: 0,
            unavailable: 0,
            removed: 0
        };

        this.registry.forEach(profile => {
            if (profile.nfStatus === 'REGISTERED') stats.registered++;
            else if (profile.nfStatus === 'UNAVAILABLE') stats.unavailable++;
            else if (profile.nfStatus === 'REMOVED') stats.removed++;
        });

        return stats;
    }

    /**
     * Get latest registration record for a specific NF
     * @param {string} nfInstanceId
     * @returns {Object|null}
     */
    getRegistrationRecord(nfInstanceId) {
        return this.registrationMessages.get(nfInstanceId) || null;
    }

    /**
     * Get all registration records (history)
     * @returns {Array}
     */
    getAllRegistrationRecords() {
        return [...this.registrationHistory];
    }

    /**
     * Get latest deregistration record for a specific NF
     * @param {string} nfInstanceId
     * @returns {Object|null}
     */
    getDeregistrationRecord(nfInstanceId) {
        return this.deregistrationMessages.get(nfInstanceId) || null;
    }

    /**
     * Get all deregistration records (history)
     * @returns {Array}
     */
    getAllDeregistrationRecords() {
        return [...this.deregistrationHistory];
    }

    /**
     * Get allowed NF types based on NF type (3GPP dependencies)
     * @param {string} nfType - NF type
     * @returns {Array} Array of allowed NF types
     */
    getAllowedNfTypes(nfType) {
        const allowedTypes = {
            'AMF': ['SMF'],
            'SMF': ['AMF'],
            'AUSF': ['AMF'],
            'UDM': ['AMF', 'SMF', 'AUSF'],
            'UDR': ['PCF', 'UDM'],
            'PCF': ['AMF', 'SMF', 'NEF', 'AF'],
            'NSSF': ['AMF'],
            'UPF': [],
            'gNB': [],
            'UE': [],
            'MySQL': [],
            'ext-dn': []
        };
        return allowedTypes[nfType] || [];
    }

    /**
     * Build NF services array with detailed service information
     * @param {Object} nfProfile - NF profile
     * @returns {Array} Array of NF services
     */
    buildNfServices(nfProfile) {
        const serviceMap = {
            'AMF': [{
                serviceInstanceId: this.generateServiceId(),
                serviceName: 'namf-comm',
                versions: [{ apiVersionInUri: 'v1', apiFullVersion: '1.0.0' }],
                scheme: 'http',
                nfServiceStatus: 'REGISTERED',
                ipEndPoints: [{ ipv4Address: nfProfile.ipAddress, port: nfProfile.port || 7777 }],
                allowedNfTypes: ['SMF'],
                priority: 0,
                capacity: 100,
                load: 0
            }],
            'SMF': [{
                serviceInstanceId: this.generateServiceId(),
                serviceName: 'nsmf-pdusession',
                versions: [{ apiVersionInUri: 'v1', apiFullVersion: '1.0.0' }],
                scheme: 'http',
                nfServiceStatus: 'REGISTERED',
                ipEndPoints: [{ ipv4Address: nfProfile.ipAddress, port: nfProfile.port || 7777 }],
                allowedNfTypes: ['AMF'],
                priority: 0,
                capacity: 100,
                load: 0
            }],
            'UPF': [{
                serviceInstanceId: this.generateServiceId(),
                serviceName: 'nupf-pfcp',
                versions: [{ apiVersionInUri: 'v1', apiFullVersion: '1.0.0' }],
                scheme: 'http',
                nfServiceStatus: 'REGISTERED',
                ipEndPoints: [{ ipv4Address: nfProfile.ipAddress, port: nfProfile.port || 7777 }],
                allowedNfTypes: ['SMF'],
                priority: 0,
                capacity: 100,
                load: 0
            }],
            'AUSF': [{
                serviceInstanceId: this.generateServiceId(),
                serviceName: 'nausf-auth',
                versions: [{ apiVersionInUri: 'v1', apiFullVersion: '1.0.0' }],
                scheme: 'http',
                nfServiceStatus: 'REGISTERED',
                ipEndPoints: [{ ipv4Address: nfProfile.ipAddress, port: nfProfile.port || 7777 }],
                allowedNfTypes: ['AMF'],
                priority: 0,
                capacity: 100,
                load: 0
            }],
            'UDM': [
                {
                    serviceInstanceId: this.generateServiceId(),
                    serviceName: 'nudm-ueau',
                    versions: [{ apiVersionInUri: 'v1', apiFullVersion: '1.0.0' }],
                    scheme: 'http',
                    nfServiceStatus: 'REGISTERED',
                    ipEndPoints: [{ ipv4Address: nfProfile.ipAddress, port: nfProfile.port || 7777 }],
                    allowedNfTypes: ['AUSF'],
                    priority: 0,
                    capacity: 100,
                    load: 0
                },
                {
                    serviceInstanceId: this.generateServiceId(),
                    serviceName: 'nudm-uecm',
                    versions: [{ apiVersionInUri: 'v1', apiFullVersion: '1.0.0' }],
                    scheme: 'http',
                    nfServiceStatus: 'REGISTERED',
                    ipEndPoints: [{ ipv4Address: nfProfile.ipAddress, port: nfProfile.port || 7777 }],
                    allowedNfTypes: ['AMF'],
                    priority: 0,
                    capacity: 100,
                    load: 0
                },
                {
                    serviceInstanceId: this.generateServiceId(),
                    serviceName: 'nudm-sdm',
                    versions: [{ apiVersionInUri: 'v2', apiFullVersion: '2.0.0' }],
                    scheme: 'http',
                    nfServiceStatus: 'REGISTERED',
                    ipEndPoints: [{ ipv4Address: nfProfile.ipAddress, port: nfProfile.port || 7777 }],
                    allowedNfTypes: ['AMF', 'SMF'],
                    priority: 0,
                    capacity: 100,
                    load: 0
                }
            ],
            'UDR': [{
                serviceInstanceId: this.generateServiceId(),
                serviceName: 'nudr-dr',
                versions: [{ apiVersionInUri: 'v1', apiFullVersion: '1.0.0' }],
                scheme: 'http',
                nfServiceStatus: 'REGISTERED',
                ipEndPoints: [{ ipv4Address: nfProfile.ipAddress, port: nfProfile.port || 7777 }],
                allowedNfTypes: ['PCF', 'UDM'],
                priority: 0,
                capacity: 100,
                load: 0
            }],
            'PCF': [
                {
                    serviceInstanceId: this.generateServiceId(),
                    serviceName: 'npcf-am-policy-control',
                    versions: [{ apiVersionInUri: 'v1', apiFullVersion: '1.0.0' }],
                    scheme: 'http',
                    nfServiceStatus: 'REGISTERED',
                    ipEndPoints: [{ ipv4Address: nfProfile.ipAddress, port: nfProfile.port || 7777 }],
                    allowedNfTypes: ['AMF', 'NEF'],
                    priority: 0,
                    capacity: 100,
                    load: 0
                },
                {
                    serviceInstanceId: this.generateServiceId(),
                    serviceName: 'npcf-smpolicycontrol',
                    versions: [{ apiVersionInUri: 'v1', apiFullVersion: '1.0.0' }],
                    scheme: 'http',
                    nfServiceStatus: 'REGISTERED',
                    ipEndPoints: [{ ipv4Address: nfProfile.ipAddress, port: nfProfile.port || 7777 }],
                    allowedNfTypes: ['SMF', 'NEF', 'AF'],
                    priority: 0,
                    capacity: 100,
                    load: 0
                }
            ],
            'NSSF': [{
                serviceInstanceId: this.generateServiceId(),
                serviceName: 'nnssf-nsselection',
                versions: [{ apiVersionInUri: 'v2', apiFullVersion: '2.0.0' }],
                scheme: 'http',
                nfServiceStatus: 'REGISTERED',
                ipEndPoints: [{ ipv4Address: nfProfile.ipAddress, port: nfProfile.port || 7777 }],
                allowedNfTypes: ['AMF'],
                priority: 0,
                capacity: 100,
                load: 0
            }]
        };

        return serviceMap[nfProfile.nfType] || [];
    }

    /**
     * Generate unique service instance ID
     * @returns {string} Service instance ID
     */
    generateServiceId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 6);
        return `${timestamp}-${random}`;
    }

    /**
     * --- ADDED: Start Periodic Logging for Deregistered NF ---
     * When an NF is deregistered, NRF generates WARNING logs every 20 seconds
     * indicating that the NF is available but not registered
     * @param {string} nfInstanceId - NF instance ID
     * @param {Object} profile - NF profile
     */
    startDeregisteredNFMonitoring(nfInstanceId, profile) {
        // Check if NF still exists in data store
        const nf = window.dataStore?.getNFById(nfInstanceId);
        if (!nf) {
            console.log(`ℹ️ NF ${nfInstanceId} not found in data store, skipping deregistered monitoring`);
            return;
        }

        console.log(`🔄 Starting deregistered NF monitoring for ${profile.nfName} (${nfInstanceId})`);

        // Store interval ID on the NF profile for cleanup
        if (!profile.deregisteredMonitorIntervalId) {
            profile.deregisteredMonitorIntervalId = setInterval(() => {
                // Check if NF still exists
                const currentNF = window.dataStore?.getNFById(nfInstanceId);
                if (!currentNF) {
                    // NF was deleted, stop monitoring
                    console.log(`🛑 Stopping deregistered monitoring for ${profile.nfName} - NF deleted`);
                    clearInterval(profile.deregisteredMonitorIntervalId);
                    profile.deregisteredMonitorIntervalId = null;
                    return;
                }

                // Check if NF was re-registered
                const currentProfile = this.registry.get(nfInstanceId);
                if (currentProfile && currentProfile.nfStatus === 'REGISTERED') {
                    // NF was re-registered, stop monitoring
                    console.log(`🛑 Stopping deregistered monitoring for ${profile.nfName} - NF re-registered`);
                    clearInterval(profile.deregisteredMonitorIntervalId);
                    profile.deregisteredMonitorIntervalId = null;
                    return;
                }

                // Calculate time since deregistration
                const timeSinceDeregistration = Date.now() - profile.deregisteredAt;
                const secondsSinceDeregistration = Math.floor(timeSinceDeregistration / 1000);

                // Generate WARNING log
                if (window.logEngine) {
                    window.logEngine.addLog('NRF', 'WARNING',
                        `Detected ${profile.nfType} ${profile.nfName} - Available but NOT registered`, {
                        nfInstanceId: nfInstanceId,
                        nfType: profile.nfType,
                        nfName: profile.nfName,
                        ipAddress: currentNF.config.ipAddress,
                        status: 'AVAILABLE',
                        registrationStatus: 'NOT_REGISTERED',
                        timeSinceDeregistration: `${secondsSinceDeregistration}s`,
                        deregistrationReason: profile.deregistrationReason || 'UNKNOWN',
                        note: 'NF is operational but not registered with NRF'
                    });
                }

                console.log(`⚠️ NRF: ${profile.nfName} is AVAILABLE but NOT REGISTERED (${secondsSinceDeregistration}s since deregistration)`);
            }, 20000); // 20 seconds interval

            console.log(`✅ Deregistered NF monitoring started for ${profile.nfName} (every 20 seconds)`);
        }
    }
}

