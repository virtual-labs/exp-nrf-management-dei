## 1. Network Repository Function (NRF)

### 1.1 What is NRF?
The NRF acts as the central directory or information hub of the entire 5G Core Network. It maintains a complete registry of all active Network Functions and their capabilities.

### 1.2 Information Stored by NRF:

As illustrated in **Figure 1**, the NRF acts as a centralized repository within the 5G Core architecture. By allowing Network Functions (such as AMF, SMF, PCF, and UDM) to register their profiles and discover available services, it enables a dynamic and interconnected network ecosystem. To support this, the NRF stores critical information for each registered NF, including:

<ol type="a">
  <li>NF Identity and NF Type (AMF, SMF, PCF, UDM, AUSF, etc.)</li>
  <li>Instance ID (UUID) - Globally unique identifier</li>
  <li>IPv4/IPv6 addresses and Port numbers</li>
  <li>Supported services and API versions</li>
  <li>Heartbeat timer value</li>
  <li>Operational status (REGISTERED / UNAVAILABLE)</li>
</ol>

<img src="images/fig-1.svg" alt="NRF Central Registry Architecture" width="30%">

*Fig. 1: NRF Central Registry Architecture*

### 1.3 Why NRF is Critical:
Without NRF, each NF would need manual configuration with addresses of every other NF, which is impossible in cloud-native 5G systems where NFs:

<ol type="a">
  <li>Scale up or down dynamically</li>
  <li>Restart due to failures</li>
  <li>Relocate across cloud nodes</li>
  <li>Launch multiple instances based on load</li>
</ol>

The NRF makes 5G Core flexible, dynamic, self-adapting, intelligent, and easy to scale.

## 2. Network Function Registration

Registration is the first and most essential procedure when any Network Function becomes operational. The NF must announce its availability to the NRF so other NFs can discover and communicate with it.

### 2.1 Registration Process:

**Step a: NF Sends Registration Request**
* HTTP Method: PUT
* Endpoint: /nnrf-nfm/v1/nf-instances/{nfInstanceId}
* Protocol: HTTP/2 over TCP
* Content Type: JSON

**Step b: NF Profile (JSON Payload)**

The request contains a detailed NF Profile with the following fields:

| Field | Description | Example |
|-------|-------------|---------|
| nfInstanceId | Unique UUID for this NF instance | 4947a69a-f61b-4bc1-b9da-47c9c5d14b64 |
| nfType | Type of Network Function | AMF, SMF, PCF, UDM, AUSF |
| nfStatus | Current operational state | REGISTERED |
| ipv4Addresses | IP address of the NF | 127.0.0.5 [NF_ip_address] |
| port | Service port number | 7777, 8080 |
| nfServices | List of supported services/APIs | namf-comm, nsmf-pdusession |
| allowedNfTypes | Which NFs can consume this service | [SMF, UDM] |
| heartBeatTimer | Periodic check interval (seconds) | 10 |
| capacity | Load handling capability | 100 |
| priority | Selection priority | 1 |

<p><strong>Step c: NRF Validation</strong></p>
<p>When NRF receives the registration request, it:</p>
<ol type="a">
  <li>Checks if nfInstanceId is unique - Rejects if duplicate exists</li>
  <li>Validates NF profile structure - Ensures all mandatory fields are present</li>
  <li>Verifies service endpoint information - Checks IP/port validity</li>
  <li>Detects conflicts - Identifies any inconsistencies</li>
</ol>

<p><strong>Step d: NRF Response</strong></p>
<ul>
  <li><strong>Success Response: 201 Created</strong>
    <ul>
      <li>NRF stores the profile in its internal repository</li>
      <li>Returns Location header indicating where profile is stored</li>
      <li>Confirms heartbeat timer value</li>
    </ul>
  </li>
  <li><strong>Failure Response: 400 Bad Request or other error codes</strong>
    <ol type="a">
      <li>Registration rejected due to invalid data or conflicts</li>
    </ol>
  </li>
</ul>

<p>The complete signaling flow for this process is depicted in <strong>Figure 2</strong>. As shown, the sequence begins with a new NF sending a registration request to the NRF. The NRF subsequently validates the provided NF profile and, upon success, returns a confirmation that includes a heartbeat timer to actively maintain the NF's registration status within the network.</p>

<img src="images/fig-2.svg" alt="NF Registration Complete Flow" width="45%">
<p><em>Fig. 2: NF Registration Complete Flow</em></p>

### 2.2 Example: AMF Registration:

<p><strong>Key Registration Details:</strong></p>
<ol type="a">
  <li>NF Type: AMF (Access and Mobility Management Function)</li>
  <li>Status: REGISTERED</li>
  <li>IP Address: 192.168.70.135</li>
  <li>Supported Service: namf-comm (Communication service)</li>
  <li>Allowed NF Types: SMF (Session Management can use AMF services)</li>
  <li>Heartbeat Timer: 10 seconds</li>
</ol>

<p><strong>What Happens:</strong></p>
<ol type="a">
  <li>AMF starts and prepares its NF profile</li>
  <li>Sends PUT request to NRF with instance ID, service list, API versions, endpoints</li>
  <li>NRF processes and validates the request</li>
  <li>NRF responds with 201 Created and assigns heartbeat timer</li>
  <li>AMF must now send periodic heartbeats every 10 seconds to stay active</li>
</ol>

### 2.3 Example: UDM Registration:

<p><strong>Key Registration Details:</strong></p>
<ol type="a">
  <li>NF Type: UDM (Unified Data Management)</li>
  <li>Multiple Services Registered:
    <ol type="a">
      <li>nudm-ueau (User Authentication)</li>
      <li>nudm-uecm (UE Context Management)</li>
      <li>nudm-sdm (Subscription Data Management)</li>
    </ol>
  </li>
</ol>

<p><strong>What Happens:</strong></p>
<ol type="a">
  <li>UDM has a richer profile since it provides multiple services</li>
  <li>Sends large JSON payload describing every service instance</li>
  <li>Includes API version, network address, supported consumers for each service</li>
  <li>NRF accepts registration and responds with 201 Created</li>
  <li>Now AMF, SMF, and AUSF can discover UDM services when needed</li>
</ol>

## 3. Network Function Discovery

### 3.1 What is Discovery?
Discovery is the mechanism that allows NFs to find and connect with other NFs dynamically without manual configuration. It works like a search operation in a service directory.

### 3.2 Discovery Process:

**Step a: NF Needs Another Service**

Example Scenario:
* AMF needs to establish a PDU session for a user
* Must contact Session Management Function (SMF)
* But 5G Core is dynamic - multiple SMF instances may be running
* AMF doesn't know their IP addresses or locations

**Step b: NF Sends Discovery Request**
* HTTP Method: GET
* Endpoint: /nnrf-disc/v1/nf-instances?nf-type=SMF
* Query Parameters: 
  * nf-type - Type of NF needed (SMF, PCF, UDM, etc.)
  * service-names - Specific service required
  * target-nf-instance-id - If looking for specific instance
  * requester-nf-instance-id - Who is requesting

**Step c: NRF Searches Internal Database**

NRF queries its registry for:
* All NFs matching the requested type
* Currently REGISTERED status
* Services matching the requirement
* Compatible API versions

**Step d: NRF Returns Discovery Response**

Success Response: 200 OK with JSON array containing:

```json
{
  "nfInstances": [
    {
      "nfInstanceId": "uuid-smf-1",
      "nfType": "SMF",
      "nfStatus": "REGISTERED",
      "ipv4Addresses": ["192.168.1.10"],
      "nfServices": [{
        "serviceInstanceId": "service-1",
        "serviceName": "nsmf-pdusession",
        "versions": [{"apiVersionInUri": "v1"}],
        "scheme": "http",
        "fqdn": "smf1.5gc.mnc001.mcc001.3gppnetwork.org",
        "ipEndPoints": [{
          "ipv4Address": "192.168.1.10",
          "port": 8080
        }]
      }],
      "capacity": 100,
      "load": 35,
      "priority": 1
    }
  ]
}
```

Each discovered NF includes critical connectivity details such as:
* IP addresses and service endpoints
* NF instance IDs - For direct communication
* Version compatibility - API version information
* Availability status - REGISTERED/UNAVAILABLE
* Capacity and load - For load balancing decisions
* Priority - For selection preference

The overarching discovery mechanism within the 5G Core is demonstrated in **Figure 3**. When a requester NF needs a specific service, it queries the NRF. The NRF then searches its internal registry and responds with a curated list of available target NFs that match the requested criteria. This seamless process allows the requester to efficiently establish direct communication with the most suitable service provider.

<img src="images/fig-3.svg" alt="NF Discovery Process" width="45%">

*Fig. 3: NF Discovery Process*

### 3.3 Why Discovery is Important:
* Removes manual configuration - No hardcoded IP addresses needed
* Supports dynamic environments - New instances appear/disappear automatically
* Enables load balancing - NRF returns multiple instances with load info
* Ensures connectivity - Always connects to active, available NFs
* Version compatibility - Finds NFs with compatible API versions

## 4. Network Function Deregistration

### 4.1 What is Deregistration?
Deregistration is the final step in the lifecycle of any Network Function. It removes the NF from the NRF registry when the NF is no longer available.

### 4.2 When Deregistration Happens:
* NF is being stopped for maintenance
* NF is being replaced with new version
* NF is being scaled down (reduced instances)
* NF is being relocated to different server
* NF is shutting down gracefully

### 4.3 Type 1: Manual/Graceful Deregistration

**Process:**
<ol type="a">
  <li>NF Sends Deregistration Request
    <ul>
      <li>HTTP Method: DELETE</li>
      <li>Endpoint: /nnrf-nfm/v1/nf-instances/{nfInstanceId}</li>
      <li>Contains the specific NF instance ID to remove</li>
    </ul>
  </li>
  <li>NRF Processes Request
    <ul>
      <li>Locates the NF profile in registry</li>
      <li>Validates the deregistration request</li>
      <li>Removes the NF profile from database</li>
    </ul>
  </li>
  <li>NRF Response:
    <ul>
      <li>Success: 204 No Content - Profile deleted successfully</li>
      <li>Error: 404 Not Found - NF instance doesn't exist</li>
    </ul>
  </li>
</ol>

**Why Manual Deregistration Matters:**
* Ensures clean shutdown - Other NFs immediately know this NF is offline
* Prevents failed connections - No other NF will try to contact removed service
* Maintains registry accuracy - Database stays current and reliable
* Avoids timeout delays - Immediate removal instead of waiting for heartbeat expiry

### 4.4 Type 2: Automatic Deregistration (Heartbeat-Based)

**The Problem:** NFs may crash unexpectedly due to:
* Software failures or bugs
* Network errors or disconnection
* Power failure or hardware issues
* Container shutdown or orchestration events
* Operating system crashes

In these cases, the NF cannot send a DELETE request.

**The Solution: Heartbeat Mechanism**

**How It Works:**
<ol type="a">
  <li>During Registration:
    <ul>
      <li>NRF assigns a heartbeat timer (e.g., 10 seconds)</li>
      <li>NF must send periodic heartbeat updates before timer expires</li>
    </ul>
  </li>
  <li>Heartbeat Update:
    <ul>
      <li>HTTP Method: PUT or PATCH</li>
      <li>Endpoint: /nnrf-nfm/v1/nf-instances/{nfInstanceId}</li>
      <li>Minimal payload - just confirms "I'm still alive"</li>
      <li>Resets the heartbeat timer</li>
    </ul>
  </li>
  <li>Heartbeat Monitoring:
    <ul>
      <li>NRF tracks last heartbeat time for each NF</li>
      <li>If no heartbeat received within timer period:
        <ul>
          <li>NRF marks NF status as "UNAVAILABLE"</li>
          <li>After additional grace period, NRF removes the profile</li>
          <li>Prevents stale records in database</li>
        </ul>
      </li>
    </ul>
  </li>
  <li>Automatic Cleanup:
    <ul>
      <li>NRF runs periodic cleanup tasks</li>
      <li>Identifies expired NF instances</li>
      <li>Removes them from registry automatically</li>
      <li>Logs the removal event</li>
    </ul>
  </li>
</ol>

To summarize these two distinct approaches, **Figure 4** compares the methods of deregistration in the 5G Core. While manual deregistration involves an NF intentionally sending a delete request to gracefully remove its profile, automatic deregistration serves as a robust fail-safe. It relies entirely on the heartbeat mechanism, allowing the NRF to independently remove an NF from the registry if it fails to provide periodic updates.

<img src="images/fig-4.svg" alt="Deregistration Types - Manual vs Automatic" width="45%">

*Fig. 4: Deregistration Types - Manual vs Automatic*

**Benefits of Heartbeat Mechanism:**
* Self-healing registry - Automatically removes dead NFs
* No manual intervention - System maintains itself
* Prevents connection failures - Discovery won't return dead NFs
* Handles edge cases - Works even when NF crashes unexpectedly
 