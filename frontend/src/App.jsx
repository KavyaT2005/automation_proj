import React, { useState, useEffect, useRef } from 'react';
import { 
  UploadCloud, Cpu, FileText, CheckCircle, Server, Globe, 
  RefreshCw, Play, Check, Eye, AlertCircle, HelpCircle, Save,
  Plus, X, Trash2, Layers, Layout, Activity, Terminal, Database, 
  ShieldAlert, Monitor, ChevronRight, Sliders, Settings, Shield,
  Key, Lock, Zap
} from 'lucide-react';

const STANDARD_FIELDS = [
  { key: 'full_name', label: 'Customer Name', placeholder: 'e.g. G 5 TRADERS' },
  { key: 'mobile_number', label: 'Mobile Number', placeholder: 'e.g. 9876543210' },
  { key: 'email', label: 'Email Address', placeholder: 'e.g. hello@reallygreatsite.com' },
  { key: 'dob', label: 'Date of Birth', placeholder: 'e.g. 15-08-1990' },
  { key: 'address', label: 'Customer Address', placeholder: 'e.g. 809A, SRI KAMATCHI AMMAN NAGAR' },
  { key: 'country', label: 'Country', placeholder: 'e.g. India' },
  { key: 'state', label: 'State', placeholder: 'e.g. Tamil Nadu' },
  { key: 'district', label: 'District', placeholder: 'e.g. Kanchipuram' },
  { key: 'pin_code', label: 'Customer PIN Code', placeholder: 'e.g. 602117' },
  { key: 'pan_no', label: 'Customer PAN', placeholder: 'e.g. BOPPG9733L' },
  { key: 'gstin_no', label: 'Customer GSTIN', placeholder: 'e.g. 33BOPPG9733L1ZE' },
  { key: 'invoice_number', label: 'Invoice Number', placeholder: 'e.g. INV-2026-905' },
  { key: 'invoice_date', label: 'Invoice Date', placeholder: 'e.g. 05-06-2026' },
  { key: 'total_amount', label: 'Total Amount', placeholder: 'e.g. 14,500.00' },
  { key: 'vendor_name', label: 'Vendor Name', placeholder: 'e.g. SPP Enterprises' },
  { key: 'vendor_address', label: 'Vendor Address', placeholder: 'e.g. NO. 176/6A, 8A MAMBAKKAM MAIN ROAD' },
  { key: 'vendor_gstin', label: 'Vendor GSTIN', placeholder: 'e.g. 33AXIPP0415D1ZZ' },
  { key: 'vendor_pan', label: 'Vendor PAN', placeholder: 'e.g. AXIPP0415D' },
  { key: 'item_description', label: 'Item Description', placeholder: 'e.g. Gold Necklace' },
  { key: 'gross_weight', label: 'Gross Weight (g)', placeholder: 'e.g. 24.550' },
  { key: 'net_weight', label: 'Net Weight (g)', placeholder: 'e.g. 22.120' },
  { key: 'purity', label: 'Purity (Karat/Hallmark)', placeholder: 'e.g. 22K (916)' },
  { key: 'making_charges', label: 'Making Charges', placeholder: 'e.g. 350.00' },
  { key: 'wastage', label: 'Wastage (%)', placeholder: 'e.g. 8.5' },
  { key: 'rate_per_gram', label: 'Rate per Gram', placeholder: 'e.g. 7,250.00' },
  { key: 'stone_weight', label: 'Stone Weight (g)', placeholder: 'e.g. 2.430' },
  { key: 'quantity', label: 'Quantity', placeholder: 'e.g. 5' },
  { key: 'unit_price', label: 'Unit Price', placeholder: 'e.g. 250.00' },
  { key: 'discount', label: 'Discount', placeholder: 'e.g. 50.00' },
  { key: 'hsn_code', label: 'HSN/SAC Code', placeholder: 'e.g. 5208' },
  { key: 'shipping_charges', label: 'Shipping Charges', placeholder: 'e.g. 120.00' },
  { key: 'sku_code', label: 'SKU Code', placeholder: 'e.g. SKU-TEXT-452' },
  { key: 'patient_name', label: 'Patient Name', placeholder: 'e.g. Rajesh Kumar' },
  { key: 'doctor_name', label: 'Doctor Name', placeholder: 'e.g. Dr. Aditi Sharma' },
  { key: 'admission_date', label: 'Admission Date', placeholder: 'e.g. 10-06-2026' },
  { key: 'discharge_date', label: 'Discharge Date', placeholder: 'e.g. 15-06-2026' },
  { key: 'room_number', label: 'Room/Ward Number', placeholder: 'e.g. Room 402' },
  { key: 'medicine_cost', label: 'Medicine Cost', placeholder: 'e.g. 4,500.00' },
  { key: 'insurance_provider', label: 'Insurance Provider', placeholder: 'e.g. Star Health' },
  { key: 'pnr_no', label: 'PNR/Booking ID', placeholder: 'e.g. PNR1234567' },
  { key: 'journey_date', label: 'Journey Date', placeholder: 'e.g. 20-06-2026' },
  { key: 'source_location', label: 'Source Location', placeholder: 'e.g. Chennai Central' },
  { key: 'destination_location', label: 'Destination Location', placeholder: 'e.g. Bangalore City' },
  { key: 'seat_number', label: 'Seat Number', placeholder: 'e.g. Coach A1, Seat 24' },
  { key: 'vehicle_no', label: 'Vehicle/Train/Flight No.', placeholder: 'e.g. 12623 / AI-502' },
];

export default function App() {
  // Read parent origin from query parameters for secure postMessage events (Point 5)
  const urlParams = new URLSearchParams(window.location.search);
  const parentOrigin = urlParams.get('parentOrigin') || '*';

  // Connection states
  const [backendOnline, setBackendOnline] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState([]);
  const [sessionToken, setSessionToken] = useState(null);
  const [slmInfo, setSlmInfo] = useState({ model: 'Qwen2.5-7B-Instruct', url: 'Ollama-local' });
  const [loadingStats, setLoadingStats] = useState(true);

  // Helper to emit SDK events to the host ERP page (Point 16)
  const emitSdkEvent = (action, data = {}) => {
    if (window.parent && window !== window.parent) {
      window.parent.postMessage({ action, ...data }, parentOrigin);
    }
  };

  // Secure API fetch helper appending authorization headers and correlation ID (Point 1, 4, 10)
  const secureFetch = async (url, options = {}) => {
    const headers = options.headers ? { ...options.headers } : {};
    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
    }
    // Generate correlation ID if not present
    if (!headers['X-Correlation-ID']) {
      headers['X-Correlation-ID'] = `corr_${Math.random().toString(36).substring(2, 10)}`;
    }
    return fetch(url, {
      ...options,
      headers
    });
  };


  // Ingestion settings
  const [ingestionMode, setIngestionMode] = useState('single'); // 'single', 'multiple', 'excel', 'pdf', 'word'
  const [documentsList, setDocumentsList] = useState([]);
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [customFields, setCustomFields] = useState([]);

  // Custom Field adder state
  const [showAddField, setShowAddField] = useState(false);
  const [customFieldName, setCustomFieldName] = useState('');

  // Document states
  const [file, setFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null); // 'uploading', 'preprocessing', 'ocr', 'slm', 'completed', 'failed'
  const [documentId, setDocumentId] = useState(null);
  const [documentData, setDocumentData] = useState(null);
  const [activeRecordIdx, setActiveRecordIdx] = useState(0);

  // Form Automation states
  const [targetUrl, setTargetUrl] = useState(''); // Default URL
  const [crawledFields, setCrawledFields] = useState([]);
  const [crawling, setCrawling] = useState(false);
  const [guidedExtracting, setGuidedExtracting] = useState(false);
  const [filling, setFilling] = useState(false);
  const [fillResult, setFillResult] = useState(null);
  const [showScreenshot, setShowScreenshot] = useState(false);
  const [bulkFilling, setBulkFilling] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  // Plugins & Layout states
  const [layout, setLayout] = useState('command'); // 'command' (3col), 'split' (2col), 'focus' (tabbed)
  const [focusTab, setFocusTab] = useState('verification'); // active tab in focus mode
  const [activePage, setActivePage] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activePlugins, setActivePlugins] = useState({
    ingestor: true,
    feed: true,
    verification: true,
    mapper: true,
    logs: true,
    evidence: true,
    admin: true
  });

  // Admin Console States
  const [adminSettings, setAdminSettings] = useState({
    rate_limit_api_key: 100,
    rate_limit_ip: 30,
    allowed_extensions: ['pdf', 'png', 'jpeg', 'jpg', 'tiff'],
    max_file_size_mb: 20,
    virus_scanning_enabled: true,
    concurrency_limit_user: 5,
    concurrency_limit_workspace: 20,
    timeout_ocr_sec: 60,
    timeout_llm_sec: 90,
    timeout_api_sec: 30,
    data_retention_days: 90,
    webhook_secret: "unitive_hmac_sec_99182",
    webhook_url: "https://unitive.in/callbacks/invoices",
    prompt_injection_protection: true,
    duplicate_detection_sha256: true,
    cors_allowed_origins: ["dashboard.unitive.in", "unitive.in"],
    gemini_api_key: '',
    gcp_project_id: '',
    gcp_location: 'us',
    docai_processor_id: ''
  });
  const [adminLogs, setAdminLogs] = useState([]);
  const [adminMetrics, setAdminMetrics] = useState({
    total_documents: 0,
    completed: 0,
    failed: 0,
    processing: 0,
    success_rate_percent: 100.0,
    avg_ocr_latency_sec: 4.15,
    avg_llm_latency_sec: 1.68,
    quarantined_files_blocked: 0,
    prompt_injections_neutralized: 0,
    rate_limit_429_count: 0,
    duplicate_cache_hits: 0,
    total_tokens_consumed: 0,
    estimated_api_cost_usd: 0.0,
    active_queue_workers: 0
  });
  const [adminKeys, setAdminKeys] = useState([]);
  const [adminActiveTab, setAdminActiveTab] = useState('metrics'); // 'metrics', 'settings', 'keys', 'logs'
  const [newKeyWorkspace, setNewKeyWorkspace] = useState('');
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyRole, setNewKeyRole] = useState('Developer');
  const [newlyCreatedKey, setNewlyCreatedKey] = useState(null);

  // Telemetry simulated states
  const [latency, setLatency] = useState(24);
  const [logs, setLogs] = useState([]);
  const logEndRef = useRef(null);

  // Log helper
  const addLog = (message, type = 'sys') => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    setLogs(prev => [...prev, { id: Math.random().toString(), time, message, type }]);
  };

  // Auto-scroll logs
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Ping latency simulation
  useEffect(() => {
    const interval = setInterval(() => {
      setLatency(Math.round(20 + Math.random() * 15));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // System startup logs
  useEffect(() => {
    addLog('System initialized. Banking-grade form injector core online.', 'sys');
    addLog('Connected to local DB sql_app.db. Table DBModelDocument read initialized.', 'db');
    addLog('Cognitive module mapping memory loaded.', 'slm');
  }, []);

  // Toggle single plugin visibility
  const togglePlugin = (key) => {
    setActivePlugins(prev => {
      const next = { ...prev, [key]: !prev[key] };
      addLog(`Plugin '${key}' visibility toggled to: ${next[key] ? 'VISIBLE' : 'HIDDEN'}`, 'sys');
      return next;
    });
  };

  // Reset active row selection on document change
  useEffect(() => {
    setActiveRecordIdx(0);
    setShowAddField(false);
  }, [documentId]);

  // Fetch all documents
  const fetchDocuments = async () => {
    try {
      const res = await secureFetch('/api/v1/documents');
      if (res.ok) {
        const data = await res.json();
        
        // Log if document count changes
        if (data.length !== documentsList.length) {
          addLog(`Database feed updated. Total records: ${data.length}`, 'db');
        }
        setDocumentsList(data);
        
        // Auto-select first document if none selected
        if (!selectedDocId && data.length > 0) {
          setSelectedDocId(data[0].id);
          setDocumentId(data[0].id);
          setDocumentData(data[0]);
          addLog(`Auto-loaded active document: ${data[0].filename}`, 'db');
        } else if (selectedDocId) {
          const updatedDoc = data.find(doc => doc.id === selectedDocId);
          if (updatedDoc) {
            setDocumentData(updatedDoc);
            
            // Sync status
            if (updatedDoc.status === 'completed' && uploadProgress !== 'completed') {
              setUploadProgress('completed');
              addLog(`SLM extraction complete for document: ${updatedDoc.filename}`, 'slm');
              emitSdkEvent('UNITIVE_EVENT_COMPLETED', { data: updatedDoc });
            } else if (updatedDoc.status === 'failed' && uploadProgress !== 'failed') {
              setUploadProgress('failed');
              addLog(`Ingestion PIPELINE FAILED for document: ${updatedDoc.filename}`, 'sys');
              emitSdkEvent('UNITIVE_EVENT_ERROR', { message: 'Document parsing failed' });
            } else if (updatedDoc.status === 'processing') {
              if (updatedDoc.ocr_raw_text && uploadProgress !== 'slm') {
                setUploadProgress('slm');
                addLog('Ollama ExtractFlow LLM processing layout tokens...', 'slm');
                emitSdkEvent('UNITIVE_EVENT_AI_STARTED', { filename: updatedDoc.filename });
              } else if (!updatedDoc.ocr_raw_text && uploadProgress !== 'ocr') {
                setUploadProgress('ocr');
                addLog('OpenCV Preprocessing & Tesseract OCR active.', 'ocr');
                emitSdkEvent('UNITIVE_EVENT_OCR_STARTED', { filename: updatedDoc.filename });
              }
            } else if (updatedDoc.status === 'pending' && uploadProgress !== 'preprocessing') {
              setUploadProgress('preprocessing');
              addLog('Document placed in background queue. Analyzing geometry...', 'sys');
              emitSdkEvent('UNITIVE_EVENT_UPLOAD_PROGRESS', { filename: updatedDoc.filename, stage: 'preprocessing' });
            }
          }
        }
      }
    } catch (e) {
      console.error("Error fetching documents:", e);
    }
  };

  // Poll for list updates
  useEffect(() => {
    fetchDocuments();
    const interval = setInterval(() => {
      fetchDocuments();
    }, 3000);
    return () => clearInterval(interval);
  }, [selectedDocId, documentsList.length]);

  // Load backend stats
  const fetchStats = async () => {
    setLoadingStats(true);
    try {
      const rootRes = await secureFetch('/api/v1/admin/settings').catch(() => null);
      if (rootRes && (rootRes.ok || rootRes.status === 401 || rootRes.status === 403)) {
        setBackendOnline(true);
        addLog('FastAPI host connection handshake: SECURE.', 'sys');
      } else {
        setBackendOnline(false);
        addLog('Warning: FastAPI host connection handshake: OFFLINE.', 'sys');
      }
    } catch (e) {
      setBackendOnline(false);
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchAdminSettings = async () => {
    try {
      const res = await secureFetch('/api/v1/admin/settings');
      if (res.ok) {
        const data = await res.json();
        setAdminSettings(data);
      }
    } catch (e) {
      console.error("Error fetching admin settings:", e);
    }
  };

  const fetchAdminData = async () => {
    try {
      const [logsRes, metricsRes, keysRes] = await Promise.all([
        secureFetch('/api/v1/admin/logs'),
        secureFetch('/api/v1/admin/metrics'),
        secureFetch('/api/v1/admin/keys')
      ]);
      
      if (logsRes.ok) {
        const logsData = await logsRes.json();
        setAdminLogs(logsData);
      }
      if (metricsRes.ok) {
        const metricsData = await metricsRes.json();
        setAdminMetrics(metricsData);
      }
      if (keysRes.ok) {
        const keysData = await keysRes.json();
        setAdminKeys(keysData);
      }
    } catch (e) {
      console.error("Error fetching admin data:", e);
    }
  };

  const saveAdminSettings = async (updatedSettings) => {
    try {
      const res = await secureFetch('/api/v1/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedSettings)
      });
      if (res.ok) {
        const data = await res.json();
        setAdminSettings(data);
        addLog('Enterprise security policy settings updated.', 'sys');
      }
    } catch (e) {
      console.error("Error saving admin settings:", e);
    }
  };

  const handleCreateAPIKey = async () => {
    if (!newKeyWorkspace.trim() || !newKeyName.trim()) {
      alert("Please fill in the Workspace name and Key descriptor.");
      return;
    }
    try {
      const res = await secureFetch('/api/v1/admin/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace: newKeyWorkspace,
          name: newKeyName,
          role: newKeyRole
        })
      });
      if (res.ok) {
        const data = await res.json();
        setNewlyCreatedKey(data);
        setNewKeyWorkspace('');
        setNewKeyName('');
        fetchAdminData();
        addLog(`Created new API Key for workspace: ${data.workspace}`, 'sys');
      }
    } catch (e) {
      console.error("Error creating key:", e);
    }
  };

  const handleRotateKey = async (keyId) => {
    if (!confirm("Are you sure you want to rotate this API key? Plaintext key will change, and the old key will immediately stop working.")) return;
    try {
      const res = await secureFetch('/api/v1/admin/keys/rotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_id: keyId })
      });
      if (res.ok) {
        const data = await res.json();
        setNewlyCreatedKey(data);
        fetchAdminData();
        addLog(`Rotated API Key ${keyId}`, 'sys');
      }
    } catch (e) {
      console.error("Error rotating key:", e);
    }
  };

  const handleRevokeKey = async (keyId) => {
    if (!confirm("Are you sure you want to revoke this API key? This cannot be undone.")) return;
    try {
      const res = await secureFetch('/api/v1/admin/keys/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_id: keyId })
      });
      if (res.ok) {
        fetchAdminData();
        addLog(`Revoked API Key ${keyId}`, 'sys');
      }
    } catch (e) {
      console.error("Error revoking key:", e);
    }
  };

  const handleDeleteKey = async (keyId) => {
    if (!confirm("Are you sure you want to delete this API key from the database record?")) return;
    try {
      const res = await secureFetch('/api/v1/admin/keys/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_id: keyId })
      });
      if (res.ok) {
        fetchAdminData();
        addLog(`Deleted API Key ${keyId}`, 'sys');
      }
    } catch (e) {
      console.error("Error deleting key:", e);
    }
  };

  const handleClearAdminLogs = async () => {
    if (!confirm("Are you sure you want to purge all administrative security audit logs?")) return;
    try {
      const res = await secureFetch('/api/v1/admin/logs/clear', { method: 'POST' });
      if (res.ok) {
        fetchAdminData();
        addLog("Administrative audit logs purged.", "sys");
      }
    } catch (e) {
      console.error("Error clearing logs:", e);
    }
  };

  // Load offline queue on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('unitive_offline_queue');
      if (saved) {
        setOfflineQueue(JSON.parse(saved));
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Trigger offline sync when backend goes online
  useEffect(() => {
    if (backendOnline && offlineQueue.length > 0) {
      syncOfflineQueue();
    }
  }, [backendOnline, offlineQueue.length]);

  const addToOfflineQueue = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = reader.result;
      const queueItem = {
        id: Math.random().toString(36).substring(7),
        name: file.name,
        type: file.type,
        data: base64Data,
        timestamp: new Date().toISOString()
      };
      setOfflineQueue(prev => {
        const next = [...prev, queueItem];
        localStorage.setItem('unitive_offline_queue', JSON.stringify(next));
        return next;
      });
      addLog(`Added '${file.name}' to offline upload queue. Will sync when reconnected.`, 'sys');
    };
    reader.readAsDataURL(file);
  };

  const syncOfflineQueue = async () => {
    if (offlineQueue.length === 0) return;
    addLog(`Backend online. Syncing ${offlineQueue.length} queued upload(s)...`, 'sys');
    const items = [...offlineQueue];
    for (const item of items) {
      try {
        const resBlob = await fetch(item.data);
        const blob = await resBlob.blob();
        const file = new File([blob], item.name, { type: item.type });
        
        const formData = new FormData();
        formData.append('file', file);
        
        const uploadRes = await secureFetch('/api/v1/documents/upload', {
          method: 'POST',
          body: formData
        });
        
        if (uploadRes.ok) {
          addLog(`Offline sync succeeded for: ${item.name}`, 'sys');
          setOfflineQueue(prev => {
            const next = prev.filter(q => q.id !== item.id);
            localStorage.setItem('unitive_offline_queue', JSON.stringify(next));
            return next;
          });
        }
      } catch (err) {
        console.error("Failed to sync offline item:", item.name, err);
        addLog("Offline sync retry failed, will retry later.", "sys");
        break; // stop loop to retry later
      }
    }
    fetchDocuments();
  };

  useEffect(() => {
    fetchStats();
    fetchAdminSettings();
    fetchAdminData();
    // Default to empty
    setTargetUrl('');
    const interval = setInterval(() => {
      fetchAdminData();
      fetchStats(); // Update connection status periodically!
    }, 4000);

    // Event listener for parent ERP messages (Requirement 5 & 6)
    const handleWindowMessage = (event) => {
      if (parentOrigin !== '*' && event.origin !== parentOrigin) {
        console.warn(`[Unitive App] Origin validation failed. Blocked message from: ${event.origin}`);
        return;
      }

      const payload = event.data;
      if (!payload || typeof payload !== 'object') return;

      if (payload.action === 'PING') {
        event.source.postMessage({ action: 'PONG' }, event.origin);
      } else if (payload.action === 'UNITIVE_INIT_SESSION') {
        if (payload.sessionToken) {
          setSessionToken(payload.sessionToken);
          addLog('Widget session token authenticated securely.', 'sys');
          emitSdkEvent('UNITIVE_EVENT_AUTH_SUCCESS', { workspace: 'Unitive Workspace' });
        }
      }
    };

    window.addEventListener('message', handleWindowMessage);
    
    // Emit widget ready event to parent (Requirement 16)
    emitSdkEvent('UNITIVE_EVENT_READY');

    return () => {
      clearInterval(interval);
      window.removeEventListener('message', handleWindowMessage);
    };
  }, [parentOrigin]);

  // Upload file handler supporting single and batch uploads
  const handleUpload = async (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length === 0) return;

    setFillResult(null);
    setBulkResult(null);

    if (!backendOnline) {
      addLog(`Backend offline. Queueing ${selectedFiles.length} file(s) for offline sync...`, 'sys');
      selectedFiles.forEach(file => addToOfflineQueue(file));
      return;
    }

    setUploadProgress('uploading');
    addLog(`Initiating packet upload of ${selectedFiles.length} file(s)...`, 'sys');

    // Concurrently upload all selected files
    await Promise.all(selectedFiles.map(async (file, index) => {
      const formData = new FormData();
      formData.append('file', file);
      if (crawledFields && crawledFields.length > 0) {
        formData.append('target_fields', JSON.stringify(crawledFields));
        if (targetUrl) {
          formData.append('target_url', targetUrl);
        }
      }
      addLog(`Uploading file buffer: ${file.name} (${Math.round(file.size / 1024)} KB)`, 'db');

      try {
        const res = await secureFetch('/api/v1/documents/upload', {
          method: 'POST',
          body: formData
        });
        if (res.ok) {
          const data = await res.json();
          addLog(`Server successfully locked file ID: ${data.id.substring(0, 8)}...`, 'sys');
          // Auto-select the first uploaded file in this batch
          if (index === 0) {
            setSelectedDocId(data.id);
            setDocumentId(data.id);
            setDocumentData(data);
            setUploadProgress('preprocessing');
          }
        }
      } catch (err) {
        addLog(`Error uploading packet: ${file.name}`, 'sys');
        console.error("Upload error for file:", file.name, err);
      }
    }));

    fetchDocuments();
  };

  // Update field value locally
  const handleFieldChange = (key, value) => {
    if (!documentData) return;
    const targetKey = documentData.corrected_json ? 'corrected_json' : 'extracted_json';
    const currentData = { ...(documentData[targetKey] || documentData.extracted_json || {}) };
    
    if (currentData.records && Array.isArray(currentData.records)) {
      const updatedRecords = [...currentData.records];
      updatedRecords[activeRecordIdx] = {
        ...updatedRecords[activeRecordIdx],
        [key]: value
      };
      
      setDocumentData({
        ...documentData,
        corrected_json: {
          ...currentData,
          records: updatedRecords
        }
      });
    } else {
      const updatedFields = { 
        ...currentData, 
        [key]: value 
      };
      setDocumentData({
        ...documentData,
        corrected_json: updatedFields
      });
    }
    
    // Add periodic logs for modifications (capped to prevent noise)
    if (Math.random() < 0.15) {
      addLog(`Local buffer updated: Field '${key}' adjusted.`, 'sys');
    }
  };

  // Remove field value locally
  const handleRemoveField = (key) => {
    if (!documentData) return;
    const targetKey = documentData.corrected_json ? 'corrected_json' : 'extracted_json';
    const currentData = { ...(documentData[targetKey] || documentData.extracted_json || {}) };
    
    if (currentData.records && Array.isArray(currentData.records)) {
      const updatedRecords = [...currentData.records];
      const updatedRec = { ...updatedRecords[activeRecordIdx] };
      delete updatedRec[key];
      updatedRecords[activeRecordIdx] = updatedRec;
      
      setDocumentData({
        ...documentData,
        corrected_json: {
          ...currentData,
          records: updatedRecords
        }
      });
    } else {
      const updatedFields = { ...currentData };
      delete updatedFields[key];
      setDocumentData({
        ...documentData,
        corrected_json: updatedFields
      });
    }
    addLog(`Field removed from current record: '${key}'`, 'sys');
  };

  // Save changes to DB
  const saveCorrections = async () => {
    if (!documentId || !documentData) return;
    const dataToSend = documentData.corrected_json || documentData.extracted_json || {};
    addLog('Submitting manual corrections to database mapping layer...', 'db');
    try {
      const res = await secureFetch(`/api/v1/documents/${documentId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ corrected_json: dataToSend })
      });
      if (res.ok) {
        const updatedDoc = await res.json();
        setDocumentData(updatedDoc);
        addLog('Handshake complete: Mapping memory updated successfully.', 'db');
        if (confirm('Corrections saved and mapping memory updated! Do you want to proceed to Step 3: Run Autofill?')) {
          setActivePage('automation');
        }
      }
    } catch (e) {
      addLog('Error: Failed to save changes to database.', 'sys');
      alert('Failed to save corrections.');
    }
  };

  // Crawl target page
  const crawlTarget = async () => {
    if (!targetUrl) return;
    setCrawling(true);
    addLog(`Initiating crawling scan on URL: ${targetUrl}`, 'auto');
    try {
      const res = await secureFetch('/api/v1/automation/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl })
      });
      if (res.ok) {
        const fields = await res.json();
        setCrawledFields(fields);
        addLog(`Scan complete. Resolved ${fields.length} visible DOM nodes matching data profiles.`, 'auto');
      } else {
        addLog('Web page DOM crawl rejected by host target.', 'auto');
        alert('Crawl failed. Check target URL.');
      }
    } catch (e) {
      addLog('Execution crash on crawler socket service.', 'sys');
      alert('Crawl crashed.');
    } finally {
      setCrawling(false);
    }
  };

  // Target-Guided Document Extraction
  const runTargetGuidedExtraction = async () => {
    if (!documentId) return;
    setGuidedExtracting(true);
    addLog(`Running target-guided extraction for document ID: ${documentId.substring(0, 8)}...`, 'slm');
    
    try {
      const res = await secureFetch(`/api/v1/documents/${documentId}/extract-for-target`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          target_url: targetUrl,
          target_fields: crawledFields
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        setDocumentData(data);
        setUploadProgress('completed');
        addLog(`Target-guided extraction completed successfully! Only target fields extracted.`, 'slm');
      } else {
        const errData = await res.json().catch(() => ({}));
        const errMsg = errData.detail || 'Target-guided extraction rejected.';
        addLog(`Target-guided extraction error: ${errMsg}`, 'sys');
        alert(`Extraction failed: ${errMsg}`);
      }
    } catch (err) {
      console.error(err);
      addLog('Execution crash on target-guided extraction service.', 'sys');
      alert('Extraction crashed.');
    } finally {
      setGuidedExtracting(false);
    }
  };

  // Trigger Fill
  const triggerAutoFill = async () => {
    if (!documentId || !targetUrl) return;
    setFilling(true);
    setFillResult(null);
    setBulkResult(null);
    
    addLog('Automation agent spawned. Launching Headless Playwright worker...', 'auto');
    addLog(`Navigating to URL: ${targetUrl}`, 'auto');
    
    const docData = documentData.corrected_json || documentData.extracted_json || {};
    const bodyData = {
      document_id: documentId,
      target_url: targetUrl
    };
    if (docData.records && Array.isArray(docData.records)) {
      bodyData.record_index = activeRecordIdx;
    }

    try {
      const res = await secureFetch('/api/v1/automation/fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData)
      });
      if (res.ok) {
        const result = await res.json();
        setFillResult(result);
        addLog(`Autofill execution status: ${result.success ? 'SUCCESS' : 'FAILED'}. Mapped ${result.filled_fields?.length || 0} fields.`, 'auto');
        setShowScreenshot(true);
      } else {
        const err = await res.json();
        addLog(`Form submission execution rejected: ${err.detail || 'Internal Error'}`, 'auto');
        alert(`Fill Failed: ${err.detail || 'Internal Error'}`);
      }
    } catch (e) {
      addLog('Automation process aborted due to server network error.', 'sys');
      alert('Autofill request crashed.');
    } finally {
      setFilling(false);
    }
  };

  // Trigger Bulk Fill
  const triggerBulkAutoFill = async () => {
    if (!documentId || !targetUrl) return;
    setBulkFilling(true);
    setBulkResult(null);
    setFillResult(null);
    
    addLog('Executing bulk transaction agent. Spawning batch operations...', 'auto');
    addLog(`Bulk injection URL target: ${targetUrl}`, 'auto');

    try {
      const res = await secureFetch('/api/v1/automation/fill-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: documentId,
          target_url: targetUrl
        })
      });
      if (res.ok) {
        const result = await res.json();
        setBulkResult(result);
        addLog(`Bulk process complete. Success rate: ${result.results?.filter(r => r.success).length}/${result.results?.length} records.`, 'auto');
        
        // Map to fillResult so that screenshot displays the bulk execution report
        setFillResult({
          success: result.success,
          screenshot_url: result.screenshot_url,
          mappings: {} // Leave empty so we default to the tabular execution summary
        });
        setShowScreenshot(true);
      } else {
        const err = await res.json();
        addLog(`Bulk injection pipeline failed: ${err.detail || 'Internal Error'}`, 'auto');
        alert(`Bulk Fill Failed: ${err.detail || 'Internal Error'}`);
      }
    } catch (e) {
      addLog('Bulk workflow execution crashed on network socket.', 'sys');
      alert('Bulk autofill request crashed.');
    } finally {
      setBulkFilling(false);
    }
  };

  // Trigger Batch Ingestion Autofill for Multiple Images/PDFs
  const triggerBatchImageAutofill = async () => {
    if (documentsList.length === 0 || !targetUrl) return;
    setBulkFilling(true);
    setBulkResult(null);
    setFillResult(null);

    const completedDocs = documentsList.filter(doc => doc.status === 'completed');
    if (completedDocs.length === 0) {
      addLog('Warning: Attempted batch automation, but zero documents exist in COMPLETED state.', 'sys');
      alert("No completed documents found in the workspace to fill. Please wait for processing to finish.");
      setBulkFilling(false);
      return;
    }

    addLog(`Spawning batch queue agent for ${completedDocs.length} images...`, 'auto');

    const results = [];
    let lastScreenshotUrl = "";
    let globalSuccess = true;

    for (let i = 0; i < completedDocs.length; i++) {
      const doc = completedDocs[i];
      const docData = doc.corrected_json || doc.extracted_json || {};
      const customerName = docData.full_name || docData.name || doc.filename;
      addLog(`[Batch Item ${i+1}/${completedDocs.length}] Starting form fill for: ${doc.filename}`, 'auto');

      try {
        const res = await secureFetch('/api/v1/automation/fill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            document_id: doc.id,
            target_url: targetUrl
          })
        });

        if (res.ok) {
          const resData = await res.json();
          results.push({
            record_index: i,
            success: resData.success,
            customer_name: customerName,
            errors: resData.errors || [],
            screenshot_url: resData.screenshot_url
          });
          if (resData.screenshot_url) {
            lastScreenshotUrl = resData.screenshot_url;
          }
          if (!resData.success) {
            globalSuccess = false;
            addLog(`[Batch Item ${i+1}/${completedDocs.length}] Form injection errors reported. Check logs.`, 'auto');
          } else {
            addLog(`[Batch Item ${i+1}/${completedDocs.length}] Inject success. Screen captured.`, 'auto');
          }
        } else {
          results.push({
            record_index: i,
            success: false,
            customer_name: customerName,
            errors: ['Failed to trigger form filler engine'],
            screenshot_url: ""
          });
          globalSuccess = false;
          addLog(`[Batch Item ${i+1}/${completedDocs.length}] Target rejected connection payload.`, 'auto');
        }
      } catch (err) {
        results.push({
          record_index: i,
          success: false,
          customer_name: customerName,
          errors: [err.message || 'Crashed during filling execution'],
          screenshot_url: ""
        });
        globalSuccess = false;
        addLog(`[Batch Item ${i+1}/${completedDocs.length}] Script execution exception.`, 'sys');
      }
    }

    setBulkResult({
      success: globalSuccess,
      results: results,
      screenshot_url: lastScreenshotUrl
    });

    setFillResult({
      success: globalSuccess,
      screenshot_url: lastScreenshotUrl,
      mappings: {}
    });

    setShowScreenshot(true);
    setBulkFilling(false);
    addLog(`Batch multi-file pipeline finished. Consolidated report generated.`, 'auto');
  };

  // Get active form state keys
  const getActiveFields = () => {
    if (!documentData) return {};
    const hasCorrected = documentData.corrected_json && Object.keys(documentData.corrected_json).length > 0;
    const docData = hasCorrected ? documentData.corrected_json : (documentData.extracted_json || {});
    if (docData.records && Array.isArray(docData.records) && docData.records.length > 0) {
      return docData.records[activeRecordIdx] || {};
    }
    return docData;
  };

  // Add custom field helper
  const addCustomField = (label) => {
    const key = label.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').trim();
    if (!key) return;
    
    if (STANDARD_FIELDS.some(f => f.key === key) || customFields.some(f => f.key === key)) {
      alert("Field already exists!");
      return;
    }
    
    setCustomFields(prev => [...prev, { key, label, placeholder: `Enter ${label}` }]);
    handleFieldChange(key, "");
    addLog(`Registered custom alignment schema field: '${key}'`, 'sys');
  };

  const getFieldLabel = (key) => {
    const std = STANDARD_FIELDS.find(f => f.key === key) || customFields.find(f => f.key === key);
    return std ? std.label : key.replace(/_/g, ' ');
  };

  // File Icon helper
  const getFileIcon = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    if (['xlsx', 'xls', 'csv', 'xlsm', 'xlsb', 'ods', 'xslv', 'xlsv'].includes(ext)) {
      return <FileText className="w-4 h-4 text-emerald-400" />;
    } else if (ext === 'pdf') {
      return <FileText className="w-4 h-4 text-rose-400" />;
    } else if (['docx', 'doc'].includes(ext)) {
      return <FileText className="w-4 h-4 text-blue-400" />;
    } else {
      return <FileText className="w-4 h-4 text-indigo-400" />;
    }
  };

  // RENDER PLUGINS AS MODULAR JSX
  
  // 1. INGESTOR PLUGIN
  const renderIngestorPlugin = () => {
    if (!activePlugins.ingestor) return null;
    return (
      <div className="glass-panel flex flex-col gap-4">
        <div className="card-header-bar">
          <div className="card-header-title">
            <UploadCloud className="w-4 h-4 text-blue-500" />
            <span>Plugin // Ingest_Core</span>
          </div>
          <div className="card-header-actions">
            <div className="card-action-dot red" onClick={() => togglePlugin('ingestor')} title="Hide module"></div>
            <div className="card-action-dot yellow" title="Settings"></div>
            <div className="card-action-dot green" title="Diagnostic"></div>
          </div>
        </div>

        <div className="mode-selector-wrapper flex flex-col gap-2">
          <span className="queue-title">Ingest Protocol</span>
          <div className="mode-selector">
            {[
              { id: 'single', label: 'Single IMG' },
              { id: 'multiple', label: 'Batch IMG' },
              { id: 'excel', label: 'Excel/CSV' },
              { id: 'pdf', label: 'PDF Doc' },
              { id: 'word', label: 'Word Doc' }
            ].map((mode) => (
              <button
                key={mode.id}
                onClick={() => {
                  setIngestionMode(mode.id);
                  setFillResult(null);
                  setBulkResult(null);
                  addLog(`Ingest protocol toggled to: ${mode.label}`, 'sys');
                }}
                className={`mode-btn ${ingestionMode === mode.id ? 'active' : ''}`}
                style={{ fontSize: '9px', padding: '6px 4px' }}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        <div className="upload-dropzone">
          <input 
            type="file" 
            accept={
              ingestionMode === 'excel' 
                ? '.xlsx,.xls,.csv,.xlsm,.xlsb,.ods,.xslv,.xlsv' 
                : ingestionMode === 'pdf' 
                ? '.pdf' 
                : ingestionMode === 'word'
                ? '.docx,.doc'
                : 'image/*'
            }
            multiple={ingestionMode === 'multiple'}
            onChange={handleUpload}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
          <UploadCloud className="w-8 h-8 text-blue-500 animate-pulse" />
          <div>
            <p className="text-[11px] font-bold text-slate-200" style={{ margin: 0 }}>
              LOAD SOURCE BINARY
            </p>
            <p className="text-[9px] text-slate-500 mt-1" style={{ margin: 0 }}>
              {ingestionMode === 'single' && 'Drag JPEG / PNG file'}
              {ingestionMode === 'multiple' && 'Drag multiple Images (Ctrl+Click)'}
              {ingestionMode === 'excel' && 'Drag spreadsheet (XLSX, CSV)'}
              {ingestionMode === 'pdf' && 'Drag structural PDF'}
              {ingestionMode === 'word' && 'Drag Word Document (.docx)'}
            </p>
          </div>
        </div>
      </div>
    );
  };

  // 2. DOCUMENT QUEUE PLUGIN
  const renderFeedPlugin = () => {
    if (!activePlugins.feed) return null;
    return (
      <div className="glass-panel flex flex-col gap-4">
        <div className="card-header-bar">
          <div className="card-header-title">
            <Database className="w-4 h-4 text-emerald-500" />
            <span>Plugin // Repository_Feed</span>
          </div>
          <div className="card-header-actions">
            <div className="card-action-dot red" onClick={() => togglePlugin('feed')} title="Hide module"></div>
            <div className="card-action-dot yellow" title="Settings"></div>
            <div className="card-action-dot green" title="Diagnostic"></div>
          </div>
        </div>

        {documentsList.length > 0 ? (
          <div className="queue-wrapper">
            <div className="flex justify-between items-center mb-1">
              <h3 className="queue-title">FEED STREAM</h3>
              <span className="text-[9px] font-mono text-slate-500">{documentsList.length} items loaded</span>
            </div>
            <div className="queue-container">
              {documentsList.map((doc) => {
                const isSelected = doc.id === selectedDocId;
                
                let badgeClass = 'badge badge-completed';
                if (doc.status === 'completed') badgeClass = 'badge badge-completed';
                else if (doc.status === 'processing') badgeClass = 'badge badge-processing';
                else if (doc.status === 'pending') badgeClass = 'badge badge-pending';
                else if (doc.status === 'failed') badgeClass = 'badge badge-failed';

                return (
                  <div 
                    key={doc.id}
                    onClick={() => {
                      setSelectedDocId(doc.id);
                      setDocumentId(doc.id);
                      setDocumentData(doc);
                      setFillResult(null);
                      setBulkResult(null);
                    }}
                    className={`queue-item ${isSelected ? 'selected' : ''}`}
                  >
                    <div className="flex items-center gap-2.5 min-width-0 flex-1">
                      {getFileIcon(doc.filename)}
                      <div className="queue-item-info">
                        <span className="queue-item-name">{doc.filename}</span>
                        <span className="queue-item-time">
                          {new Date(doc.created_at).toLocaleDateString()} {new Date(doc.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                        </span>
                      </div>
                    </div>
                    
                    <div className="queue-item-actions">
                      <span className={badgeClass} style={{ fontSize: '8px', padding: '1px 4px' }}>
                        {doc.status}
                      </span>
                      
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (confirm(`Delete database entry "${doc.filename}"?`)) {
                            try {
                              const res = await secureFetch(`/api/v1/documents/${doc.id}`, { method: 'DELETE' });
                              if (res.ok) {
                                addLog(`Deleted document entry: ${doc.filename}`, 'db');
                                if (selectedDocId === doc.id) {
                                  setSelectedDocId(null);
                                  setDocumentId(null);
                                  setDocumentData(null);
                                  setUploadProgress(null);
                                }
                                fetchDocuments();
                              }
                            } catch (err) {
                              console.error(err);
                            }
                          }
                        }}
                        className="delete-btn"
                        title="Purge record"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-6 text-slate-500 bg-slate-950/20 border border-slate-900 rounded mt-2 text-center">
            <FileText className="w-6 h-6 stroke-[1.5] mb-2 text-slate-700" />
            <p className="text-[10px] font-mono">REPOSITORY EMPTY</p>
          </div>
        )}

        {/* Progress Tracker */}
        {uploadProgress && uploadProgress !== 'completed' && uploadProgress !== 'failed' && (
          <div className="progress-tracker flex items-center gap-2.5">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-500" />
            <span className="text-[10px] text-slate-300 font-mono">
              {uploadProgress === 'uploading' && 'Ingesting file buffer...'}
              {uploadProgress === 'preprocessing' && 'OpenCV: Scanning contours...'}
              {uploadProgress === 'ocr' && 'OCR: Extracting layout lines...'}
              {uploadProgress === 'slm' && 'ExtractFlow: LLM resolution...'}
            </span>
          </div>
        )}

        {uploadProgress === 'failed' && (
          <div className="progress-tracker flex items-center gap-2" style={{ borderColor: 'rgba(239, 68, 68, 0.2)', background: 'rgba(239, 68, 68, 0.04)' }}>
            <AlertCircle className="w-3.5 h-3.5 text-red-500" />
            <span className="text-[10px] text-red-400 font-mono">Ingest pipeline failed.</span>
          </div>
        )}
      </div>
    );
  };

  // 3. FIELD VERIFICATION STUDIO PLUGIN
  const renderVerificationPlugin = () => {
    if (!activePlugins.verification) return null;
    return (
      <div className="glass-panel flex flex-col gap-4">
        <div className="card-header-bar">
          <div className="card-header-title">
            <Sliders className="w-4 h-4 text-amber-500" />
            <span>Plugin // Verification_Studio</span>
          </div>
          <div className="card-header-actions">
            <div className="card-action-dot red" onClick={() => togglePlugin('verification')} title="Hide module"></div>
            <div className="card-action-dot yellow" title="Settings"></div>
            <div className="card-action-dot green" title="Diagnostic"></div>
          </div>
        </div>

        {!documentData ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-12 text-slate-500">
            <ShieldAlert className="w-12 h-12 stroke-[1] mb-2 text-slate-600 animate-pulse" />
            <p className="text-xs font-mono">NO ACTIVE FILE SWITCHED</p>
            <p className="text-[10px] text-slate-600 max-w-xs mt-1">Select or ingest a file from the repository feed to initialize the extraction workspace.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 flex-1">
            
            {/* Header Telemetry Grid */}
            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-950/20 border border-slate-900 rounded">
              <div className="flex flex-col">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Doc ID Ref</span>
                <span className="text-xs font-mono text-slate-300 truncate" title={documentData.id}>
                  {documentData.id}
                </span>
              </div>
              <div className="flex flex-col">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Confidence Index</span>
                  <span className="text-[10px] font-mono font-bold text-amber-400">
                    {Math.round((documentData.confidence_score || 0) * 100)}%
                  </span>
                </div>
              </div>
              <div className="confidence-gauge-bg">
                <div 
                  className="confidence-gauge-fill"
                  style={{ 
                    width: `${(documentData.confidence_score || 0) * 100}%`,
                    backgroundColor: documentData.confidence_score > 0.8 ? 'var(--success-color)' : 'var(--warning-color)'
                  }}
                />
              </div>
            </div>

            {/* Row Selector for spreadsheets */}
            {(() => {
              const data = documentData.corrected_json || documentData.extracted_json || {};
              if (data.records && Array.isArray(data.records) && data.records.length > 0) {
                return (
                  <div className="row-nav-card">
                    <button
                      onClick={() => {
                        setActiveRecordIdx(prev => Math.max(0, prev - 1));
                        setFillResult(null);
                        setBulkResult(null);
                        addLog(`Navigation: Switch to spreadsheet row: ${activeRecordIdx}`, 'sys');
                      }}
                      disabled={activeRecordIdx === 0}
                      className="custom-adder-button text-[10px]"
                      style={{ padding: '4px 8px' }}
                    >
                      &larr; PREV
                    </button>
                    
                    <div className="flex-1 flex flex-col items-center">
                      <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Record Frame Row</span>
                      <select
                        value={activeRecordIdx}
                        onChange={(e) => {
                          const idx = parseInt(e.target.value, 10);
                          setActiveRecordIdx(idx);
                          setFillResult(null);
                          setBulkResult(null);
                          addLog(`Navigation: Selected row frame index: ${idx + 1}`, 'sys');
                        }}
                        className="bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded px-2 py-1 font-mono cursor-pointer mt-1 focus:outline-none focus:border-blue-500 w-full max-w-[200px]"
                      >
                        {data.records.map((rec, index) => (
                          <option key={index} value={index}>
                            Row {index + 1}: {rec.full_name || rec.name || `Record ${index + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    <button
                      onClick={() => {
                        setActiveRecordIdx(prev => Math.min(data.records.length - 1, prev + 1));
                        setFillResult(null);
                        setBulkResult(null);
                        addLog(`Navigation: Switch to spreadsheet row: ${activeRecordIdx + 2}`, 'sys');
                      }}
                      disabled={activeRecordIdx === data.records.length - 1}
                      className="custom-adder-button text-[10px]"
                      style={{ padding: '4px 8px' }}
                    >
                      NEXT &rarr;
                    </button>
                  </div>
                );
              }
              return null;
            })()}

            {/* Fields grid */}
            <div className="verification-scroll-container">
              {(() => {
                const activeFields = getActiveFields();
                const keysToExclude = ['id', 'created_at', 'updated_at', 'status', 'filename', 'storage_path', 'mime_type', 'confidence_score', 'ocr_raw_text', 'records', '_pipeline_metadata'];
                const editableFields = Object.entries(activeFields).filter(([key]) => !keysToExclude.includes(key));
                
                if (editableFields.length === 0) {
                  return <p className="text-xs text-slate-400 italic p-4 text-center">No fields resolved. Choose or create fields below.</p>;
                }
                
                // Required fields check
                const defaultRequiredFields = [
                  { key: 'full_name', label: 'Customer Name' },
                  { key: 'mobile_number', label: 'Mobile Number' },
                  { key: 'country', label: 'Country' },
                  { key: 'state', label: 'State' }
                ];
                
                let requiredFields = defaultRequiredFields;
                if (crawledFields && crawledFields.length > 0) {
                  const requiredKeywords = ['name', 'mobile', 'phone', 'country', 'state'];
                  requiredFields = crawledFields
                    .filter(cf => {
                      if (!cf) return false;
                      const lbl = (cf.label || '').toLowerCase();
                      const name = (cf.name || '').toLowerCase();
                      return lbl.includes('*') || cf.required || requiredKeywords.some(k => lbl.includes(k) || name.includes(k));
                    })
                    .map(cf => ({
                      key: cf.id || cf.name || '',
                      label: (cf.label || cf.name || cf.id || '').toString().replace('*', '').trim()
                    }));
                }
                
                const missingRequired = requiredFields.filter(f => {
                  const val = (activeFields && f.key && activeFields[f.key] !== undefined) ? activeFields[f.key] : '';
                  return !val || !val.toString().trim();
                });

                return (
                  <>
                    
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {editableFields.map(([key, val]) => {
                        const std = STANDARD_FIELDS.find(f => f.key === key);
                        const isRequired = requiredFields.some(rf => rf.key === key);
                        const isEmpty = !val || !val.toString().trim();
                        const isWarning = isRequired && isEmpty;
                        
                        return (
                          <div key={key} className={`field-input-card ${isWarning ? 'border-red-500/30 bg-red-500/5' : ''}`}>
                            <div className="field-label-wrapper">
                              <span className="field-label-text">
                                {getFieldLabel(key)}
                                {isRequired && <span className="text-red-500 ml-1 font-bold">*</span>}
                              </span>
                              <button
                                onClick={() => handleRemoveField(key)}
                                className="text-[9px] text-red-400 hover:text-red-300 font-mono transition-colors"
                                title="Remove key"
                              >
                                [PURGE]
                              </button>
                            </div>
                            <input 
                              type="text" 
                              value={val || ''}
                              onChange={(e) => handleFieldChange(key, e.target.value)}
                              className={`input-glass ${isWarning ? 'border-red-500' : ''}`}
                              placeholder={std ? std.placeholder : `Enter ${key.replace(/_/g, ' ')}`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}

              {/* Inline Add Field Panel */}
              <div className="mt-2 pt-3 border-t border-slate-900">
                {!showAddField ? (
                  <div className="flex justify-end">
                    <button 
                      onClick={() => setShowAddField(true)}
                      className="custom-adder-button flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      ADD SCHEMATIC FIELD
                    </button>
                  </div>
                ) : (
                  <div className="p-3 rounded bg-slate-950/45 border border-slate-900 flex flex-col gap-2.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-mono">CHOOSE/CREATE DATA FIELD</span>
                      <button 
                        onClick={() => {
                          setShowAddField(false);
                          setCustomFieldName('');
                        }} 
                        className="text-slate-400 hover:text-slate-200"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Tag list */}
                    <div className="flex flex-wrap gap-1 max-h-[80px] overflow-y-auto">
                      {STANDARD_FIELDS.filter(f => !Object.keys(getActiveFields()).includes(f.key)).map((f) => (
                        <button
                          key={f.key}
                          onClick={() => {
                            handleFieldChange(f.key, "");
                            setShowAddField(false);
                          }}
                          className="px-2 py-0.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-[9px] font-mono rounded text-slate-300"
                        >
                          + {f.label}
                        </button>
                      ))}
                    </div>

                    {/* Custom key name */}
                    <div className="flex gap-2 items-center mt-1 border-t border-slate-900/60 pt-2">
                      <input 
                        type="text" 
                        placeholder="Custom Schema Tag (e.g. spouse_name)"
                        value={customFieldName}
                        onChange={(e) => setCustomFieldName(e.target.value)}
                        className="input-glass py-1 px-2 text-xs flex-1"
                      />
                      <button
                        onClick={() => {
                          if (customFieldName.trim()) {
                            addCustomField(customFieldName);
                            setCustomFieldName('');
                            setShowAddField(false);
                          }
                        }}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-[10px] font-bold transition-colors"
                      >
                        ADD
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Confirm Save database */}
            <div className="flex justify-center mt-1">
              <button 
                onClick={saveCorrections}
                className="px-3 py-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded text-[10px] font-bold flex items-center gap-1.5 transition-colors"
              >
                <Save className="w-3 h-3 text-slate-400" />
                CONFIRM & WRITE DB CHANGES
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // 4. PORTAL MAPPER PLUGIN
  const renderMapperPlugin = () => {
    if (!activePlugins.mapper) return null;
    return (
      <div className="glass-panel flex flex-col gap-4">
        <div className="card-header-bar">
          <div className="card-header-title">
            <Globe className="w-4 h-4 text-indigo-500" />
            <span>Plugin // Portal_DOM_Mapper</span>
          </div>
          <div className="card-header-actions">
            <div className="card-action-dot red" onClick={() => togglePlugin('mapper')} title="Hide module"></div>
            <div className="card-action-dot yellow" title="Settings"></div>
            <div className="card-action-dot green" title="Diagnostic"></div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-mono">AUTOMATION TARGET NODE (URL)</label>
          <div className="flex gap-2">
            <input 
              type="text" 
              value={targetUrl}
              onChange={(e) => {
                setTargetUrl(e.target.value);
                setCrawledFields([]); // Reset scan
              }}
              className="input-glass text-xs"
              placeholder="Paste your target URL here..."
            />
            <button 
              onClick={crawlTarget}
              disabled={crawling || !targetUrl}
              className="px-3 py-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-[10px] font-bold rounded flex items-center gap-1"
            >
              {crawling ? <RefreshCw className="w-3 h-3 animate-spin text-indigo-500" /> : <Eye className="w-3 h-3" />}
              <span>VERIFY</span>
            </button>
          </div>
        </div>

        {/* DOM nodes list */}
        {crawling ? (
          <div className="flex items-center gap-2 text-slate-500 p-2 text-[10px] font-mono">
            <RefreshCw className="w-3 h-3 animate-spin text-indigo-400" />
            <span>Aligning browser DOM descriptors...</span>
          </div>
        ) : crawledFields.length > 0 ? (
          <div className="flex flex-col gap-2.5">
            <div className="px-3 py-1.5 rounded bg-emerald-500/5 border border-emerald-500/10 flex items-center gap-2 text-[10px] text-emerald-400 font-mono">
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>DOM ALIGNED: {crawledFields.length} INPUTS IDENTIFIED</span>
            </div>
            
            {documentId && (
              <button 
                onClick={runTargetGuidedExtraction}
                disabled={guidedExtracting || crawling}
                className="px-3 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:from-slate-800 disabled:to-slate-800 text-white rounded text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 shadow-md border border-violet-500/20 active:scale-95"
              >
                {guidedExtracting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>EXTRACTING TARGET FIELDS...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5 text-yellow-300 fill-yellow-300" />
                    <span>RUN TARGET-GUIDED EXTRACTION</span>
                  </>
                )}
              </button>
            )}
            
            {/* Visual alignment grid map */}
            <div className="alignment-grid max-h-[140px] overflow-y-auto">
              {crawledFields.slice(0, 8).map((cf, idx) => (
                <div className="alignment-row" key={idx}>
                  <span className="alignment-field-key">{cf.name || cf.id || `field_${idx}`}</span>
                  <span className="alignment-arrow">&rarr;</span>
                  <span className="alignment-dom-node">{cf.tag || 'input'}[type={cf.type || 'text'}]</span>
                </div>
              ))}
              {crawledFields.length > 8 && (
                <div className="text-center text-[9px] text-slate-600 font-mono mt-1">
                  + {crawledFields.length - 8} additional inputs aligned
                </div>
              )}
            </div>

            {!documentId && (
              <div className="flex justify-center mt-4 pt-3 border-t border-slate-900/60">
                <button
                  onClick={() => setActivePage('documents')}
                  className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 hover:scale-105 active:scale-95 text-white rounded font-bold text-xs shadow-lg transition-all flex items-center gap-1.5"
                >
                  <span>👉 PROCEED TO STEP 2: UPLOAD DOCUMENT</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-[10px] font-mono text-slate-600 italic p-2 border border-dashed border-slate-900 rounded text-center">
            Run DOM verify to inspect injection node alignments.
          </div>
        )}
      </div>
    );
  };

  // 5. EXECUTION CENTER PLUGIN
  const renderExecutionPlugin = () => {
    if (!activePlugins.verification || !documentData) return null; // dependency: must have file loaded
    return (
      <div className="glass-panel flex flex-col gap-4">
        <div className="card-header-bar">
          <div className="card-header-title">
            <Play className="w-4 h-4 text-purple-500" />
            <span>Plugin // Execution_Trigger</span>
          </div>
          <div className="card-header-actions">
            <div className="card-action-dot red" title="Toggle active"></div>
            <div className="card-action-dot yellow" title="Settings"></div>
            <div className="card-action-dot green" title="Diagnostic"></div>
          </div>
        </div>

        {(() => {
          const docData = documentData?.corrected_json || documentData?.extracted_json || {};
          const isSpreadsheet = docData.records && Array.isArray(docData.records) && docData.records.length > 0;
          
          return (
            <div className="flex flex-col gap-2.5">
              {isSpreadsheet ? (
                <>
                  <button 
                    onClick={triggerBulkAutoFill}
                    disabled={bulkFilling || filling || !documentId}
                    className="btn-premium w-full"
                  >
                    {bulkFilling ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin mr-2" />
                        RUNNING BULK AUTOMATION...
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current mr-2" />
                        EXECUTE BULK INJECTION (ALL ROWS)
                      </>
                    )}
                  </button>
                  <button 
                    onClick={triggerAutoFill}
                    disabled={bulkFilling || filling || !documentId}
                    className="px-3 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 rounded text-[11px] font-bold transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5 text-indigo-400" />
                    <span>INJECT ACTIVE ROW ({activeRecordIdx + 1}) ONLY</span>
                  </button>
                </>
              ) : ingestionMode === 'multiple' && documentsList.filter(d => d.status === 'completed').length > 1 ? (
                <>
                  <button 
                    onClick={triggerBatchImageAutofill}
                    disabled={bulkFilling || filling}
                    className="btn-premium w-full"
                  >
                    {bulkFilling ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin mr-2" />
                        RUNNING BATCH AUTOMATION...
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current mr-2" />
                        EXECUTE BATCH INJECTION (ALL IMAGES)
                      </>
                    )}
                  </button>
                  <button 
                    onClick={triggerAutoFill}
                    disabled={bulkFilling || filling || !documentId}
                    className="px-3 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 rounded text-[11px] font-bold transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5 text-indigo-400" />
                    <span>INJECT SELECTED IMAGE ONLY</span>
                  </button>
                </>
              ) : (
                <button 
                  onClick={triggerAutoFill}
                  disabled={filling || !documentId}
                  className="btn-premium w-full"
                >
                  {filling ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin mr-2" />
                      INJECTING FIELD PAYLOADS...
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current mr-2" />
                      EXECUTE FORM INJECTION
                    </>
                  )}
                </button>
              )}
            </div>
          );
        })()}
      </div>
    );
  };

  // 6. LIVE CONSOLE LOGS PLUGIN
  const renderLogsPlugin = () => {
    if (!activePlugins.logs) return null;
    return (
      <div className="glass-panel flex flex-col gap-4">
        <div className="card-header-bar">
          <div className="card-header-title">
            <Terminal className="w-4 h-4 text-teal-400" />
            <span>Plugin // Live_Engine_Console</span>
          </div>
          <div className="card-header-actions">
            <div className="card-action-dot red" onClick={() => togglePlugin('logs')} title="Hide module"></div>
            <div className="card-action-dot yellow" title="Clear console" onClick={() => setLogs([])}></div>
            <div className="card-action-dot green" title="Diagnostic"></div>
          </div>
        </div>

        <div className="log-console">
          {logs.length === 0 ? (
            <div className="text-slate-600 italic">No telemetry streams captured...</div>
          ) : (
            logs.map(log => (
              <div className="log-line" key={log.id}>
                <span className="log-time">[{log.time}]</span>
                <span className={`log-tag-${log.type}`}>{log.type.toUpperCase()}: </span>
                <span>{log.message}</span>
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </div>
    );
  };

  // 7. SCREEN EVIDENCE VIEWER
  const renderEvidencePlugin = () => {
    if (!activePlugins.evidence || !fillResult) return null;
    return (
      <div className="glass-panel flex flex-col gap-4">
        <div className="card-header-bar">
          <div className="card-header-title">
            <Monitor className="w-4 h-4 text-purple-400" />
            <span>Plugin // Evidence_Output</span>
          </div>
          <div className="card-header-actions">
            <div className="card-action-dot red" onClick={() => { setFillResult(null); setBulkResult(null); }} title="Close evidence"></div>
            <div className="card-action-dot yellow" title="Refresh"></div>
            <div className="card-action-dot green" title="Inspect capture"></div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-mono">AUTOMATION FRAME EVIDENCE</span>
            <button 
              onClick={() => setShowScreenshot(true)} 
              className="text-[9px] font-mono text-blue-400 hover:underline"
            >
              [ENLARGE FRAME]
            </button>
          </div>
          
          <div className="border border-slate-900 rounded overflow-hidden shadow-inner bg-black/60 flex justify-center p-1.5 max-h-[140px]">
            <img 
              src={fillResult.screenshot_url} 
              alt="Automation Frame"
              className="max-h-[120px] object-contain rounded"
              onError={(e) => {
                e.target.src = 'https://raw.githubusercontent.com/microsoft/playwright/main/packages/playwright-core/src/server/chromium/video.png';
              }}
            />
          </div>
        </div>
      </div>
    );
  };

  // 7.5 DEDICATED FULLSCREEN ENTERPRISE ADMIN & TELEMETRY CORE SCREEN (Point 1-15 HUD)
  const renderEnterpriseAdminScreen = () => {
    return (
      <div className="flex flex-col gap-6 p-4 bg-slate-900 text-slate-100 rounded-lg border border-slate-800 shadow-2xl font-sans mt-2">
        {/* Screen Header Bar */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 p-4 bg-slate-950 border border-slate-850 rounded-lg shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-600/10 border border-orange-500/25 rounded-lg">
              <Shield className="w-6 h-6 text-orange-500" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold uppercase tracking-widest text-slate-100">UNITIVE CONTROL CENTER</span>
                <span className="text-[9px] font-mono font-bold bg-orange-600 text-white px-1.5 py-0.5 rounded border border-orange-500/30 uppercase tracking-wide">ENTERPRISE SECURITY CORE</span>
              </div>
              <span className="text-[10px] text-slate-400 font-medium">Real-Time Threat Protection, Cache Engine Telemetry & Webhook Registry</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-[10px] font-mono">
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded">
              <span className="led led-green led-pulse" style={{ width: '6px', height: '6px' }}></span>
              <span className="text-slate-400">SHIELD SYSTEM:</span>
              <span className="text-emerald-400 font-bold">ONLINE</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded">
              <Database className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-slate-400">CACHE PERSISTENCE:</span>
              <span className="text-blue-400 font-bold">{adminMetrics.cache_service_status?.includes("Redis") ? "REDIS_ENGINE" : "IN_MEMORY"}</span>
            </div>
          </div>
        </div>

        {/* 3 Column Top Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* COLUMN 1: LIVE PERFORMANCE & SECURITY STATS */}
          <div className="flex flex-col gap-6">
            <div className="bg-slate-950 border border-slate-850 rounded-lg p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 border-b border-slate-850 pb-2">
                <Activity className="w-4 h-4 text-orange-500" />
                <span className="font-mono text-[10px] font-bold text-slate-300 uppercase tracking-wider">Operational Metrics</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                {[
                  { label: 'Total Ingested', value: adminMetrics.total_documents, color: 'text-slate-200' },
                  { label: 'Success Rate', value: `${adminMetrics.success_rate_percent}%`, color: 'text-emerald-400 font-bold' },
                  { label: 'Error Rate', value: `${adminMetrics.error_rate_percent || 0.0}%`, color: 'text-rose-400' },
                  { label: 'Active Sessions', value: adminMetrics.active_users || 3, color: 'text-purple-400' },
                  { label: 'Daily Requests', value: adminMetrics.daily_requests || 0, color: 'text-blue-400' },
                  { label: 'Active Workers', value: adminMetrics.active_queue_workers, color: 'text-teal-400' }
                ].map((m, idx) => (
                  <div key={idx} className="bg-slate-900 border border-slate-800 p-2 rounded flex flex-col gap-1">
                    <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">{m.label}</span>
                    <span className={`text-[11px] font-bold ${m.color}`}>{m.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-850 rounded-lg p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 border-b border-slate-850 pb-2">
                <ShieldAlert className="w-4 h-4 text-rose-500" />
                <span className="font-mono text-[10px] font-bold text-slate-300 uppercase tracking-wider">Security Interceptions</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                <div className="bg-slate-900 border border-slate-800 p-2 rounded flex flex-col gap-1">
                  <span className="text-[8px] text-slate-500 font-bold uppercase">Malware Quarantined</span>
                  <span className="text-[11px] text-rose-400 font-bold">{adminMetrics.quarantined_files_blocked} threats</span>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-2 rounded flex flex-col gap-1">
                  <span className="text-[8px] text-slate-500 font-bold uppercase">Prompt Injections</span>
                  <span className="text-[11px] text-amber-400 font-bold">{adminMetrics.prompt_injections_neutralized} blocks</span>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-2 rounded flex flex-col gap-1">
                  <span className="text-[8px] text-slate-500 font-bold uppercase">Rate Limit Triggers</span>
                  <span className="text-[11px] text-orange-400 font-bold">{adminMetrics.rate_limit_429_count} (429s)</span>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-2 rounded flex flex-col gap-1">
                  <span className="text-[8px] text-slate-500 font-bold uppercase">Deduplication Hits</span>
                  <span className="text-[11px] text-emerald-400 font-bold">{adminMetrics.duplicate_cache_hits} inputs</span>
                </div>
              </div>
            </div>
          </div>

          {/* COLUMN 2: CACHE METADATA HUD TELEMETRY */}
          <div className="flex flex-col gap-6">
            <div className="bg-slate-950 border border-slate-850 rounded-lg p-4 flex flex-col gap-3.5 h-full">
              <div className="flex justify-between items-center border-b border-slate-850 pb-2">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-pink-500" />
                  <span className="font-mono text-[10px] font-bold text-slate-300 uppercase tracking-wider">Enterprise Cache Telemetry HUD</span>
                </div>
                <span className="text-[8px] font-mono text-slate-400 font-bold uppercase border border-slate-800 px-1.5 py-0.5 rounded bg-slate-900">active</span>
              </div>
              <div className="flex flex-col gap-2 font-mono text-[10px]">
                <div className="flex justify-between items-center p-2 bg-slate-900 border border-slate-800 rounded">
                  <span className="text-slate-400 font-medium">Active Cache Driver Mode:</span>
                  <span className="font-bold text-slate-200">{adminMetrics.cache_service_status || 'InMemory Cache Service'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div className="flex flex-col p-2 bg-slate-900 border border-slate-800 rounded text-center">
                    <span className="text-slate-500 text-[8px] uppercase font-bold tracking-wide">Workspace Settings</span>
                    <span className="font-bold text-blue-400 text-[9px] mt-1">10m Cache (Active)</span>
                  </div>
                  <div className="flex flex-col p-2 bg-slate-900 border border-slate-800 rounded text-center">
                    <span className="text-slate-500 text-[8px] uppercase font-bold tracking-wide">API key verify</span>
                    <span className="font-bold text-blue-400 text-[9px] mt-1">10m Cache (Active)</span>
                  </div>
                  <div className="flex flex-col p-2 bg-slate-900 border border-slate-800 rounded text-center">
                    <span className="text-slate-500 text-[8px] uppercase font-bold tracking-wide">OCR Results</span>
                    <span className="font-bold text-blue-400 text-[9px] mt-1">24h Cache (Active)</span>
                  </div>
                  <div className="flex flex-col p-2 bg-slate-900 border border-slate-800 rounded text-center">
                    <span className="text-slate-500 text-[8px] uppercase font-bold tracking-wide">AI Extraction</span>
                    <span className="font-bold text-blue-400 text-[9px] mt-1">30d Cache (Active)</span>
                  </div>
                  <div className="flex flex-col p-2 bg-slate-900 border border-slate-800 rounded text-center">
                    <span className="text-slate-500 text-[8px] uppercase font-bold tracking-wide">Sentence Embeddings</span>
                    <span className="font-bold text-blue-400 text-[9px] mt-1">30d Cache (Active)</span>
                  </div>
                  <div className="flex flex-col p-2 bg-slate-900 border border-slate-800 rounded text-center">
                    <span className="text-slate-500 text-[8px] uppercase font-bold tracking-wide">Results Download</span>
                    <span className="font-bold text-blue-400 text-[9px] mt-1">10m Cache (Active)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* COLUMN 3: WEBHOOK & COGNITIVE PRICING */}
          <div className="flex flex-col gap-6">
            <div className="bg-slate-950 border border-slate-850 rounded-lg p-4 flex flex-col gap-3.5 h-full">
              <div className="flex items-center gap-2 border-b border-slate-850 pb-2">
                <Cpu className="w-4 h-4 text-indigo-400" />
                <span className="font-mono text-[10px] font-bold text-slate-300 uppercase tracking-wider">Cognitive Extraction Metrics</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                <div className="bg-slate-900 border border-slate-800 p-2 rounded flex flex-col gap-1">
                  <span className="text-[8px] text-slate-500 font-bold uppercase">Estimated Month Cost</span>
                  <span className="text-[11px] text-indigo-400 font-bold">${adminMetrics.monthly_cost_usd || 0.0} USD</span>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-2 rounded flex flex-col gap-1">
                  <span className="text-[8px] text-slate-500 font-bold uppercase">Estimated Today Cost</span>
                  <span className="text-[11px] text-indigo-400 font-bold">${adminMetrics.today_cost_usd || 0.0} USD</span>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-2 rounded flex flex-col gap-1 col-span-2">
                  <span className="text-[8px] text-slate-500 font-bold uppercase">Extraction latency baseline</span>
                  <div className="flex justify-between items-center text-[10px] mt-1 text-slate-300">
                    <span>Avg OCR: {adminMetrics.avg_ocr_latency_sec}s</span>
                    <span>Avg SLM: {adminMetrics.avg_llm_latency_sec}s</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 2 Column Settings & Keys controls */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Security rule configuration */}
          <div className="bg-slate-950 border border-slate-850 rounded-lg p-4 flex flex-col gap-4">
            <div className="flex items-center gap-2 border-b border-slate-850 pb-2">
              <Sliders className="w-4 h-4 text-indigo-400" />
              <span className="font-mono text-[10px] font-bold text-slate-300 uppercase tracking-wider">Security Shield Config Toggles</span>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[9px] font-bold font-mono">
                  <span className="text-slate-400">Rate Limit (Per API Key)</span>
                  <span className="text-orange-400">{adminSettings.rate_limit_api_key} req/m</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="500"
                  step="10"
                  value={adminSettings.rate_limit_api_key}
                  onChange={(e) => saveAdminSettings({ ...adminSettings, rate_limit_api_key: parseInt(e.target.value) })}
                  className="w-full accent-orange-500 cursor-pointer h-1 rounded-lg"
                />
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[9px] font-bold font-mono">
                  <span className="text-slate-400">Rate Limit (Unauth Per IP)</span>
                  <span className="text-orange-400">{adminSettings.rate_limit_ip} req/m</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="100"
                  step="5"
                  value={adminSettings.rate_limit_ip}
                  onChange={(e) => saveAdminSettings({ ...adminSettings, rate_limit_ip: parseInt(e.target.value) })}
                  className="w-full accent-orange-500 cursor-pointer h-1 rounded-lg"
                />
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[9px] font-bold font-mono">
                  <span className="text-slate-400">Max File Size Ingestion</span>
                  <span className="text-blue-400">{adminSettings.max_file_size_mb} MB</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="100"
                  step="1"
                  value={adminSettings.max_file_size_mb}
                  onChange={(e) => saveAdminSettings({ ...adminSettings, max_file_size_mb: parseInt(e.target.value) })}
                  className="w-full accent-blue-500 cursor-pointer h-1 rounded-lg"
                />
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[9px] font-bold font-mono">
                  <span className="text-slate-400">Data retention days</span>
                  <span className="text-blue-400">{adminSettings.data_retention_days} days</span>
                </div>
                <input
                  type="range"
                  min="7"
                  max="365"
                  step="7"
                  value={adminSettings.data_retention_days}
                  onChange={(e) => saveAdminSettings({ ...adminSettings, data_retention_days: parseInt(e.target.value) })}
                  className="w-full accent-blue-500 cursor-pointer h-1 rounded-lg"
                />
              </div>

              <div className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-[9px] font-bold text-slate-400">Allowed extensions (comma separated)</span>
                <input
                  type="text"
                  value={adminSettings.allowed_extensions.join(', ')}
                  onChange={(e) => saveAdminSettings({ ...adminSettings, allowed_extensions: e.target.value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) })}
                  className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-slate-700 mt-1 font-mono"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-slate-850 pt-3">
              {[
                { key: 'virus_scanning_enabled', label: 'Enable ClamAV Quarantine / Malware Scan' },
                { key: 'prompt_injection_protection', label: 'Enable Precompiled System Override Prompt Injection Protection' },
                { key: 'duplicate_detection_sha256', label: 'Enable SHA-256 Request Deduplication Cache' }
              ].map(item => (
                <label key={item.key} className="flex items-center gap-2 cursor-pointer text-[10px] font-mono text-slate-400">
                  <input
                    type="checkbox"
                    checked={adminSettings[item.key]}
                    onChange={(e) => saveAdminSettings({ ...adminSettings, [item.key]: e.target.checked })}
                    className="rounded border-slate-800 bg-slate-900 text-orange-600 focus:ring-orange-500"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-slate-850 pt-3">
              <div className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-[9px] font-bold text-slate-400">Webhook Endpoint URL</span>
                <input
                  type="text"
                  placeholder="https://client-system.com/webhooks"
                  value={adminSettings.webhook_url}
                  onChange={(e) => saveAdminSettings({ ...adminSettings, webhook_url: e.target.value })}
                  className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-200 mt-1 font-mono"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-bold text-slate-400">HMAC Secret Signing Key</span>
                <div className="flex gap-1.5 mt-1">
                  <input
                    type="text"
                    readOnly
                    value={adminSettings.webhook_secret}
                    className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-[9px] text-slate-400 font-mono grow select-all"
                  />
                  <button
                    onClick={() => saveAdminSettings({ ...adminSettings, webhook_secret: `unitive_hmac_${Math.random().toString(36).substring(2, 10)}` })}
                    className="px-2 py-1 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-white rounded text-[8px] font-bold font-mono transition-colors"
                  >
                    ROTATE
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Workspace API Keys list */}
          <div className="bg-slate-950 border border-slate-850 rounded-lg p-4 flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-slate-850 pb-2">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-emerald-400" />
                <span className="font-mono text-[10px] font-bold text-slate-300 uppercase tracking-wider">Workspace API Keys Registry</span>
              </div>
              <button
                onClick={() => {
                  const ws = prompt("Enter Workspace Name:", "Billing Office");
                  const name = prompt("Enter Key Name/Owner:", "Production Core key");
                  const role = prompt("Enter Role (Admin / Developer / Read Only):", "Developer");
                  if (ws && name && role) {
                    setNewKeyWorkspace(ws);
                    setNewKeyName(name);
                    setNewKeyRole(role);
                    setTimeout(() => handleCreateAPIKey(), 100);
                  }
                }}
                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[9px] font-bold font-mono flex items-center gap-1 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>GENERATE CREDENTIAL</span>
              </button>
            </div>

            {newlyCreatedKey && (
              <div className="p-3 bg-emerald-950 border border-emerald-800 rounded text-emerald-200 text-[10px] flex flex-col gap-1.5 font-mono shadow-sm">
                <span className="font-bold text-emerald-400 uppercase">[!] SECURE PLAIN-TEXT API KEY GENERATED:</span>
                <div className="flex gap-2 items-center bg-slate-900 border border-emerald-900 p-1.5 rounded">
                  <span className="text-white font-bold select-all flex-1 text-xs truncate">{newlyCreatedKey.raw_key}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(newlyCreatedKey.raw_key);
                      alert("Plaintext key copied! Save it now. It will not be shown again.");
                    }}
                    className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[9px]"
                  >
                    COPY KEY
                  </button>
                </div>
                <span className="text-[8px] text-slate-400">Hashed securely under SHA-256 database layers. Cannot be restored.</span>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-[9px] border-collapse divide-y divide-slate-800">
                <thead>
                  <tr className="bg-slate-900/50 text-slate-400 font-bold">
                    <th className="p-2">Name</th>
                    <th className="p-2">Workspace</th>
                    <th className="p-2">Prefix</th>
                    <th className="p-2">Role</th>
                    <th className="p-2">Status</th>
                    <th className="p-2 text-right">Control</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {adminKeys.map((k) => (
                    <tr key={k.key_id} className="hover:bg-slate-900/40">
                      <td className="p-2 font-semibold text-slate-200">{k.name}</td>
                      <td className="p-2 text-slate-400">{k.workspace}</td>
                      <td className="p-2 text-slate-300 font-bold">{k.prefix}</td>
                      <td className="p-2">
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                          k.role === 'Admin' ? 'bg-rose-950/40 text-rose-400 border border-rose-900/50' :
                          k.role === 'Developer' ? 'bg-blue-950/40 text-blue-400 border border-blue-900/50' :
                          'bg-slate-900 text-slate-400 border border-slate-800'
                        }`}>{k.role.toUpperCase()}</span>
                      </td>
                      <td className="p-2">
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                          k.status === 'active' ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/50' : 'bg-rose-950 text-rose-400 border border-rose-900'
                        }`}>{k.status.toUpperCase()}</span>
                      </td>
                      <td className="p-2 text-right">
                        <div className="flex justify-end gap-1">
                          {k.status === 'active' && (
                            <>
                              <button
                                onClick={() => handleRotateKey(k.key_id)}
                                className="px-1.5 py-0.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded text-[8px] text-slate-300"
                              >
                                ROTATE
                              </button>
                              <button
                                onClick={() => handleRevokeKey(k.key_id)}
                                className="px-1.5 py-0.5 bg-rose-950/40 border border-rose-900/50 text-rose-400 hover:bg-rose-900 rounded text-[8px]"
                              >
                                REVOKE
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleDeleteKey(k.key_id)}
                            className="p-1 text-slate-400 hover:text-rose-400 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Audit Log Terminal Screen Panel */}
        <div className="bg-slate-950 border border-slate-850 rounded-lg p-4 flex flex-col gap-3 font-mono text-[10px]">
          <div className="flex justify-between items-center border-b border-slate-850 pb-2">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-orange-500" />
              <span className="font-bold uppercase tracking-wider text-slate-300">Live Security and System Auditing Log Terminal</span>
            </div>
            <button
              onClick={handleClearAdminLogs}
              className="px-2.5 py-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white rounded text-[9px] transition-colors"
            >
              [PURGE_LOGS_DATABASE]
            </button>
          </div>
          
          <div className="h-[300px] overflow-y-auto bg-slate-950 border border-slate-900 rounded p-3 flex flex-col gap-2 custom-scrollbar">
            {adminLogs.map((log, idx) => (
              <div key={idx} className="flex gap-2.5 py-1 hover:bg-slate-900/60 rounded px-1">
                <span className="text-slate-600 select-none text-[8.5px] font-semibold">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={`text-[8px] px-1 font-bold rounded shrink-0 select-none ${
                  log.level === 'WARNING' ? 'bg-red-950/40 text-red-400 border border-red-900/50' :
                  log.event_type === 'auth' ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/50' :
                  log.event_type === 'ratelimit' ? 'bg-amber-950/40 text-amber-400 border border-amber-900/50' :
                  'bg-slate-900 text-slate-400 border border-slate-800'
                }`}>
                  {log.level}
                </span>
                <span className="text-slate-400 select-none font-bold">[{log.event_type.toUpperCase()}]</span>
                <span className="text-slate-200 select-text font-sans mt-0.5">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // 8. ENTERPRISE ADMIN CONSOLE PLUGIN
  const renderAdminPlugin = () => {
    if (!activePlugins.admin) return null;
    return (
      <div className="glass-panel flex flex-col gap-4" style={{ borderTop: '3px solid var(--accent-secondary)' }}>
        <div className="card-header-bar">
          <div className="card-header-title">
            <Shield className="w-4 h-4 text-pink-500" />
            <span>Plugin // Enterprise_Admin_Console</span>
          </div>
          <div className="card-header-actions">
            <div className="card-action-dot red" onClick={() => togglePlugin('admin')} title="Hide module"></div>
            <div className="card-action-dot yellow" title="Logs tab" onClick={() => setAdminActiveTab('logs')}></div>
            <div className="card-action-dot green" title="Settings tab" onClick={() => setAdminActiveTab('settings')}></div>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-200 pb-1 gap-1">
          {[
            { id: 'metrics', label: 'System Metrics' },
            { id: 'settings', label: 'Security Settings' },
            { id: 'keys', label: 'Workspace API Keys' },
            { id: 'logs', label: 'Security Audit logs' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setAdminActiveTab(tab.id);
                setNewlyCreatedKey(null);
              }}
              className={`px-3 py-1.5 font-mono text-[9px] font-bold rounded transition-all border ${
                adminActiveTab === tab.id
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                  : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border-slate-200'
              }`}
            >
              {tab.label.toUpperCase()}
            </button>
          ))}
        </div>

        {/* TAB 1: METRICS */}
        {adminActiveTab === 'metrics' && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { label: 'Total Ingested', value: adminMetrics.total_documents, color: 'text-slate-700' },
                { label: 'Success Rate', value: `${adminMetrics.success_rate_percent}%`, color: 'text-emerald-600 font-bold' },
                { label: 'Estimated API Cost', value: `$${adminMetrics.estimated_api_cost_usd}`, color: 'text-indigo-600' },
                { label: 'Avg OCR Latency', value: `${adminMetrics.avg_ocr_latency_sec}s`, color: 'text-amber-600' },
                { label: 'Avg LLM Latency', value: `${adminMetrics.avg_llm_latency_sec}s`, color: 'text-purple-600' },
                { label: 'Active Workers', value: adminMetrics.active_queue_workers, color: 'text-teal-600' },
              ].map((m, idx) => (
                <div key={idx} className="bg-slate-50 border border-slate-200 p-2.5 rounded flex flex-col gap-1 shadow-sm">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{m.label}</span>
                  <span className={`text-xs font-mono font-bold ${m.color}`}>{m.value}</span>
                </div>
              ))}
            </div>

            {/* Security Blocks Section */}
            <div className="border border-slate-200 rounded p-3 bg-slate-50 flex flex-col gap-2">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Security Rule Enforcement Counters</span>
              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                <div className="flex justify-between items-center p-1.5 bg-white border border-slate-150 rounded">
                  <span className="text-red-600 font-semibold">Quarantined Threats:</span>
                  <span className="font-bold text-slate-800">{adminMetrics.quarantined_files_blocked}</span>
                </div>
                <div className="flex justify-between items-center p-1.5 bg-white border border-slate-150 rounded">
                  <span className="text-orange-600 font-semibold">Prompt Injections:</span>
                  <span className="font-bold text-slate-800">{adminMetrics.prompt_injections_neutralized}</span>
                </div>
                <div className="flex justify-between items-center p-1.5 bg-white border border-slate-150 rounded">
                  <span className="text-amber-600 font-semibold">Rate Limit Triggers:</span>
                  <span className="font-bold text-slate-800">{adminMetrics.rate_limit_429_count}</span>
                </div>
                <div className="flex justify-between items-center p-1.5 bg-white border border-slate-150 rounded">
                  <span className="text-emerald-600 font-semibold">Duplicate Cache Hits:</span>
                  <span className="font-bold text-slate-800">{adminMetrics.duplicate_cache_hits}</span>
                </div>
              </div>
            </div>

            {/* Cache Telemetry Section */}
            <div className="border border-slate-200 rounded p-3 bg-slate-50 flex flex-col gap-2">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Enterprise Cache Telemetry HUD</span>
              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                <div className="flex justify-between items-center p-1.5 bg-white border border-slate-150 rounded col-span-2">
                  <span className="text-pink-600 font-semibold">Cache engine Mode:</span>
                  <span className="font-bold text-slate-800">{adminMetrics.cache_service_status || 'Verifying connection...'}</span>
                </div>
                <div className="flex justify-between items-center p-1.5 bg-white border border-slate-150 rounded">
                  <span className="text-slate-600 font-semibold">Settings Cache TTL:</span>
                  <span className="font-bold text-indigo-600">10 Min Cache (Active)</span>
                </div>
                <div className="flex justify-between items-center p-1.5 bg-white border border-slate-150 rounded">
                  <span className="text-slate-600 font-semibold">API Key Cache TTL:</span>
                  <span className="font-bold text-indigo-600">10 Min Cache (Active)</span>
                </div>
                <div className="flex justify-between items-center p-1.5 bg-white border border-slate-150 rounded">
                  <span className="text-slate-600 font-semibold">OCR Results Cache TTL:</span>
                  <span className="font-bold text-indigo-600">24 Hr Cache (Active)</span>
                </div>
                <div className="flex justify-between items-center p-1.5 bg-white border border-slate-150 rounded">
                  <span className="text-slate-600 font-semibold">AI Extracted Cache TTL:</span>
                  <span className="font-bold text-indigo-600">7 Day Cache (Active)</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: SETTINGS */}
        {adminActiveTab === 'settings' && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[10px] font-bold">
                  <span className="text-slate-600">Rate Limit (Per API Key)</span>
                  <span className="text-orange-600 font-mono">{adminSettings.rate_limit_api_key} req/m</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="500"
                  step="10"
                  value={adminSettings.rate_limit_api_key}
                  onChange={(e) => saveAdminSettings({ ...adminSettings, rate_limit_api_key: parseInt(e.target.value) })}
                  className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[10px] font-bold">
                  <span className="text-slate-600">Rate Limit (Unauth Per IP)</span>
                  <span className="text-orange-600 font-mono">{adminSettings.rate_limit_ip} req/m</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="100"
                  step="5"
                  value={adminSettings.rate_limit_ip}
                  onChange={(e) => saveAdminSettings({ ...adminSettings, rate_limit_ip: parseInt(e.target.value) })}
                  className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[10px] font-bold">
                  <span className="text-slate-600">Max Ingestion File Size</span>
                  <span className="text-indigo-600 font-mono">{adminSettings.max_file_size_mb} MB</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="100"
                  step="1"
                  value={adminSettings.max_file_size_mb}
                  onChange={(e) => saveAdminSettings({ ...adminSettings, max_file_size_mb: parseInt(e.target.value) })}
                  className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[10px] font-bold">
                  <span className="text-slate-600">Data Lifecycle Retention</span>
                  <span className="text-indigo-600 font-mono">{adminSettings.data_retention_days} days</span>
                </div>
                <input
                  type="range"
                  min="7"
                  max="365"
                  step="7"
                  value={adminSettings.data_retention_days}
                  onChange={(e) => saveAdminSettings({ ...adminSettings, data_retention_days: parseInt(e.target.value) })}
                  className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div className="flex flex-col gap-1 col-span-1 md:col-span-2">
                <span className="text-[10px] font-bold text-slate-600">Allowed Ingestion Extensions (comma separated)</span>
                <input
                  type="text"
                  value={adminSettings.allowed_extensions.join(', ')}
                  onChange={(e) => saveAdminSettings({ ...adminSettings, allowed_extensions: e.target.value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) })}
                  className="input-glass text-xs py-1.5 px-2 mt-1"
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-600">OCR Engine Timeout (seconds)</span>
                <input
                  type="number"
                  value={adminSettings.timeout_ocr_sec}
                  onChange={(e) => saveAdminSettings({ ...adminSettings, timeout_ocr_sec: parseInt(e.target.value) || 60 })}
                  className="bg-slate-100 border border-slate-200 rounded px-2.5 py-1 text-xs font-mono text-slate-700"
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-600">LLM Cognitive Timeout (seconds)</span>
                <input
                  type="number"
                  value={adminSettings.timeout_llm_sec}
                  onChange={(e) => saveAdminSettings({ ...adminSettings, timeout_llm_sec: parseInt(e.target.value) || 90 })}
                  className="bg-slate-100 border border-slate-200 rounded px-2.5 py-1 text-xs font-mono text-slate-700"
                />
              </div>

              <div className="flex flex-col gap-2.5 border-t border-slate-100 pt-3 col-span-1 md:col-span-2">
                {[
                  { key: 'virus_scanning_enabled', label: 'Enable ClamAV Quarantine / Malware Scan' },
                  { key: 'prompt_injection_protection', label: 'Enable System Override Prompt Injection Protection' },
                  { key: 'duplicate_detection_sha256', label: 'Enable SHA-256 Request Deduplication Cache' }
                ].map(item => (
                  <label key={item.key} className="flex items-center gap-2 cursor-pointer text-[11px] font-medium text-slate-600">
                    <input
                      type="checkbox"
                      checked={adminSettings[item.key]}
                      onChange={(e) => saveAdminSettings({ ...adminSettings, [item.key]: e.target.checked })}
                      className="rounded border-slate-350 text-orange-600 focus:ring-orange-500"
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>

              <div className="flex flex-col gap-1 border-t border-slate-100 pt-3 col-span-1 md:col-span-2">
                <span className="text-[10px] font-bold text-slate-600">Webhook Callback Endpoint URL</span>
                <input
                  type="text"
                  placeholder="https://client-system.com/webhooks"
                  value={adminSettings.webhook_url}
                  onChange={(e) => saveAdminSettings({ ...adminSettings, webhook_url: e.target.value })}
                  className="input-glass text-xs py-1.5 px-2 mt-1"
                />
              </div>

              <div className="flex flex-col gap-1 col-span-1 md:col-span-2">
                <div className="flex justify-between text-[10px] font-bold">
                  <span className="text-slate-600">Webhook Signature Secret (HMAC-SHA256)</span>
                  <button 
                    onClick={() => saveAdminSettings({ ...adminSettings, webhook_secret: `unitive_hmac_${Math.random().toString(36).substring(2, 10)}` })}
                    className="text-[8px] text-orange-600 font-mono hover:underline border-none bg-transparent cursor-pointer"
                  >
                    [ROTATE WEBHOOK SECRET]
                  </button>
                </div>
                <input
                  type="text"
                  value={adminSettings.webhook_secret}
                  onChange={(e) => saveAdminSettings({ ...adminSettings, webhook_secret: e.target.value })}
                  className="input-glass text-xs font-mono py-1.5 px-2 mt-1"
                />
              </div>

            </div>
          </div>
        )}

        {/* TAB 3: API KEYS */}
        {adminActiveTab === 'keys' && (
          <div className="flex flex-col gap-4">
            
            <div className="bg-slate-50 border border-slate-200 rounded p-3 flex flex-col gap-2.5">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-mono">Issue Workspace Access API Key</span>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Workspace Name (e.g. ERP Retail)"
                  value={newKeyWorkspace}
                  onChange={(e) => setNewKeyWorkspace(e.target.value)}
                  className="input-glass text-[11px] py-1.5 px-2"
                />
                <input
                  type="text"
                  placeholder="Key Descriptor (e.g. Dev Server)"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="input-glass text-[11px] py-1.5 px-2"
                />
                <select
                  value={newKeyRole}
                  onChange={(e) => setNewKeyRole(e.target.value)}
                  className="bg-white border border-slate-200 text-[11px] rounded px-2 py-1 text-slate-600 focus:outline-none"
                >
                  <option value="Admin">Admin</option>
                  <option value="Developer">Developer</option>
                  <option value="Read Only">Read Only</option>
                  <option value="Billing">Billing</option>
                </select>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleCreateAPIKey}
                  className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded text-[10px] font-bold transition-colors"
                >
                  GENERATE CRITICAL CREDENTIAL
                </button>
              </div>
            </div>

            {newlyCreatedKey && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded text-rose-800 text-[11px] flex flex-col gap-1.5 font-mono">
                <span className="font-bold text-rose-700 uppercase">[!] SECURE PLAIN-TEXT API KEY GENERATED:</span>
                <div className="flex gap-2 items-center bg-white border border-rose-200 p-1.5 rounded">
                  <span className="text-rose-900 font-bold select-all flex-1 text-xs truncate">{newlyCreatedKey.raw_key}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(newlyCreatedKey.raw_key);
                      alert("Plaintext key copied! Save it now. It will not be shown again.");
                    }}
                    className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-white rounded text-[9px]"
                  >
                    COPY KEY
                  </button>
                </div>
                <span className="text-[9px] text-rose-600">This key is hashed using SHA-256 before storage. Keep it safe. Plaintext cannot be recovered.</span>
              </div>
            )}

            <div className="overflow-x-auto border border-slate-200 rounded bg-white">
              <table className="min-w-full divide-y divide-slate-200 text-[10px]">
                <thead className="bg-slate-50 font-mono">
                  <tr>
                    <th className="px-3 py-2 text-left text-[9px] font-bold text-slate-500 uppercase">Descriptor</th>
                    <th className="px-3 py-2 text-left text-[9px] font-bold text-slate-500 uppercase">Workspace</th>
                    <th className="px-3 py-2 text-left text-[9px] font-bold text-slate-500 uppercase">Prefix</th>
                    <th className="px-3 py-2 text-left text-[9px] font-bold text-slate-500 uppercase">Role</th>
                    <th className="px-3 py-2 text-left text-[9px] font-bold text-slate-500 uppercase">State</th>
                    <th className="px-3 py-2 text-right text-[9px] font-bold text-slate-500 uppercase">Control</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 font-mono">
                  {adminKeys.map((k) => (
                    <tr key={k.key_id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium text-slate-700">{k.name}</td>
                      <td className="px-3 py-2 text-slate-500 truncate max-w-[100px]">{k.workspace}</td>
                      <td className="px-3 py-2 text-slate-600 font-bold">{k.prefix}</td>
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                          k.role === 'Admin' ? 'bg-red-50 text-red-600 border border-red-100' :
                          k.role === 'Developer' ? 'bg-blue-50 text-blue-600 border border-blue-100' :
                          k.role === 'Billing' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                          'bg-slate-50 text-slate-600 border border-slate-100'
                        }`}>
                          {k.role}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`px-1 rounded text-[8px] ${
                          k.status === 'active' ? 'bg-emerald-50 text-emerald-600 font-semibold' : 'bg-red-50 text-red-500 line-through'
                        }`}>
                          {k.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right flex justify-end gap-1.5">
                        <button
                          onClick={() => handleRotateKey(k.key_id)}
                          className="px-1.5 py-0.5 bg-slate-105 hover:bg-slate-200 border border-slate-350 rounded text-[9px]"
                          title="Rotate API Key"
                        >
                          ROTATE
                        </button>
                        {k.status === 'active' && (
                          <button
                            onClick={() => handleRevokeKey(k.key_id)}
                            className="px-1.5 py-0.5 bg-rose-50 hover:bg-rose-100 border border-rose-250 text-rose-600 rounded text-[9px]"
                            title="Revoke access"
                          >
                            REVOKE
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteKey(k.key_id)}
                          className="px-1.5 py-0.5 bg-slate-900 hover:bg-slate-800 text-white rounded text-[9px]"
                          title="Delete key record"
                        >
                          DELETE
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </div>
        )}

        {/* TAB 4: AUDIT LOGS */}
        {adminActiveTab === 'logs' && (
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-mono">Security Guard Audit logs</span>
              <button
                onClick={handleClearAdminLogs}
                className="text-[9px] font-mono text-red-500 hover:underline border-none bg-transparent cursor-pointer font-bold"
              >
                [PURGE AUDIT LOG DATABASE]
              </button>
            </div>

            <div className="bg-slate-950 text-slate-300 font-mono text-[10px] rounded p-3 overflow-y-auto max-h-[220px] flex flex-col gap-1.5">
              {adminLogs.length === 0 ? (
                <div className="text-slate-600 italic">No security events triggered. Shield secure.</div>
              ) : (
                adminLogs.map((log, idx) => {
                  let badgeColor = 'text-slate-400 border border-slate-800 bg-slate-900';
                  if (log.event_type === 'quarantine' || log.level === 'WARNING' || log.event_type === 'injection') badgeColor = 'text-red-400 border border-red-950 bg-red-950/20';
                  else if (log.event_type === 'ratelimit') badgeColor = 'text-orange-400 border border-orange-950 bg-orange-950/20';
                  else if (log.event_type === 'auth') badgeColor = 'text-purple-400 border border-purple-950 bg-purple-950/20';
                  else if (log.event_type === 'audit') badgeColor = 'text-emerald-400 border border-emerald-950 bg-emerald-950/20';
                  else if (log.event_type === 'config') badgeColor = 'text-blue-400 border border-blue-950 bg-blue-950/20';

                  return (
                    <div key={idx} className="flex gap-2 items-start py-0.5 border-b border-slate-900 last:border-0 font-mono">
                      <span className="text-slate-600 font-semibold">{log.timestamp.slice(11, 19)}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${badgeColor}`}>
                        {log.event_type || 'system'}
                      </span>
                      <span className="flex-1 text-slate-200">{log.message}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="smartfill-plugin-root min-h-screen text-slate-700">
      {/* Offline Banner */}
      {!backendOnline && (
        <div className="bg-red-50 text-red-700 border border-red-200 p-3 flex items-center justify-between shadow-sm" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100 }}>
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 animate-pulse" />
            <span className="font-semibold text-xs">Unitive Technologies host connection lost. Attempting to reconnect...</span>
          </div>
          {offlineQueue.length > 0 && (
            <span className="bg-red-200/80 px-2 py-0.5 rounded text-[10px] font-mono font-bold text-red-800">
              {offlineQueue.length} upload(s) queued offline
            </span>
          )}
        </div>
      )}

      {/* Main ERP Layout container */}
      <div className="erp-layout" style={{ paddingTop: !backendOnline ? '48px' : '0' }}>
        
        {/* Left Sidebar */}
        <aside className={`erp-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
          
          {/* Logo Header */}
          <div className="erp-sidebar-logo">
            <img 
              src="https://unitive.in/assets/images/logo/9.png" 
              alt="Unitive Technologies Logo"
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
            {!sidebarCollapsed && (
              <div className="logo-text">
                <h2>Unitive Automate</h2>
                <span>KEYSTONE v0.1.0-alpha.5</span>
              </div>
            )}
          </div>

          {/* Sidebar Nav */}
          <div className="erp-sidebar-nav">
            
            {/* Group: Operations */}
            <div className="erp-sidebar-section-label">
              {sidebarCollapsed ? 'OP' : 'Operations'}
            </div>
            
            <button 
              onClick={() => setActivePage('dashboard')}
              className={`erp-sidebar-item ${activePage === 'dashboard' ? 'active' : ''}`}
            >
              <Activity className="nav-icon" />
              {!sidebarCollapsed && <span className="nav-label">Dashboard</span>}
            </button>

            <button 
              onClick={() => setActivePage('documents')}
              className={`erp-sidebar-item ${activePage === 'documents' ? 'active' : ''}`}
            >
              <FileText className="nav-icon" />
              {!sidebarCollapsed && <span className="nav-label">Documents</span>}
            </button>

            <button 
              onClick={() => setActivePage('verification')}
              className={`erp-sidebar-item ${activePage === 'verification' ? 'active' : ''}`}
            >
              <Sliders className="nav-icon" />
              {!sidebarCollapsed && <span className="nav-label">Verification</span>}
            </button>

            <button 
              onClick={() => setActivePage('automation')}
              className={`erp-sidebar-item ${activePage === 'automation' ? 'active' : ''}`}
            >
              <Globe className="nav-icon" />
              {!sidebarCollapsed && <span className="nav-label">Automation</span>}
            </button>

            <div className="erp-sidebar-divider" />

            {/* Group: Administration */}
            <div className="erp-sidebar-section-label">
              {sidebarCollapsed ? 'ADM' : 'Administration'}
            </div>

            <button 
              onClick={() => setActivePage('admin-metrics')}
              className={`erp-sidebar-item ${activePage === 'admin-metrics' ? 'active' : ''}`}
            >
              <Activity className="nav-icon text-orange-500" />
              {!sidebarCollapsed && <span className="nav-label">Metrics</span>}
            </button>

            <button 
              onClick={() => setActivePage('admin-settings')}
              className={`erp-sidebar-item ${activePage === 'admin-settings' ? 'active' : ''}`}
            >
              <Settings className="nav-icon" />
              {!sidebarCollapsed && <span className="nav-label">Settings</span>}
            </button>

            <button 
              onClick={() => setActivePage('admin-keys')}
              className={`erp-sidebar-item ${activePage === 'admin-keys' ? 'active' : ''}`}
            >
              <Key className="nav-icon" />
              {!sidebarCollapsed && <span className="nav-label">API Keys</span>}
            </button>

            <button 
              onClick={() => setActivePage('admin-logs')}
              className={`erp-sidebar-item ${activePage === 'admin-logs' ? 'active' : ''}`}
            >
              <ShieldAlert className="nav-icon" />
              {!sidebarCollapsed && <span className="nav-label">Audit Logs</span>}
            </button>

            <div className="erp-sidebar-divider" />

            {/* Group: System */}
            <div className="erp-sidebar-section-label">
              {sidebarCollapsed ? 'SYS' : 'System'}
            </div>

            <button 
              onClick={() => setActivePage('console')}
              className={`erp-sidebar-item ${activePage === 'console' ? 'active' : ''}`}
            >
              <Terminal className="nav-icon" />
              {!sidebarCollapsed && <span className="nav-label">Live Console</span>}
            </button>

          </div>

          {/* Sidebar Collapse Toggle Button */}
          <button 
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="erp-sidebar-collapse-btn"
          >
            <ChevronRight className={`nav-icon collapse-icon ${!sidebarCollapsed ? 'expanded' : ''}`} />
            {!sidebarCollapsed && <span>Collapse Sidebar</span>}
          </button>

        </aside>

        {/* Main Content Area */}
        <main className={`erp-main-content ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
          
          {/* Topbar breadcrumb / stats header */}
          <div className="erp-topbar">
            <div className="erp-topbar-left">
              <span className="erp-topbar-breadcrumb">
                {activePage === 'dashboard' && 'Dashboard Overview'}
                {activePage === 'documents' && 'Document Repositories'}
                {activePage === 'verification' && 'Verification Studio'}
                {activePage === 'automation' && 'Execution Portal Mapper'}
                {activePage === 'admin-metrics' && 'Security & Operational Telemetry'}
                {activePage === 'admin-settings' && 'Enterprise System Protection'}
                {activePage === 'admin-keys' && 'Workspace Key Registry'}
                {activePage === 'admin-logs' && 'Security Audit Terminal'}
                {activePage === 'console' && 'System Engine Live Feed'}
              </span>
            </div>

            <div className="erp-topbar-right">
              {/* Status Led */}
              <div className="erp-topbar-stat">
                <span className={`led ${backendOnline ? 'led-green' : 'led-red'} led-pulse`} style={{ width: '6px', height: '6px' }}></span>
                <span>{backendOnline ? 'SECURE_LINK' : 'OFFLINE'}</span>
              </div>
              
              {/* Latency if online */}
              {backendOnline && (
                <div className="erp-topbar-stat" style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: '12px' }}>
                  <span>LATENCY: {latency}ms</span>
                </div>
              )}

              {/* Total documents count */}
              <div className="erp-topbar-stat" style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: '12px' }}>
                <span>DB FEED: {documentsList.length} BUFFERS</span>
              </div>
            </div>
          </div>

          {/* Content Pane */}
          <div className="erp-page-content">
            
            {/* Visual Guided Stepper HUD */}
            {['dashboard', 'documents', 'verification', 'automation'].includes(activePage) && (
              <div className="mb-8 p-5 rounded-xl bg-slate-950/30 backdrop-blur-md border border-slate-900/80 shadow-xl">
                <div className="flex items-center justify-center max-w-4xl mx-auto font-mono text-[9px] uppercase tracking-wider font-bold gap-3">
                  
                  {/* Step 1 */}
                  <button 
                    onClick={() => setActivePage('automation')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all border ${
                      activePage === 'automation'
                        ? 'bg-blue-500/10 border-blue-500/30 text-blue-400 font-bold scale-105 shadow-[0_0_12px_rgba(59,130,246,0.15)]' 
                        : crawledFields.length > 0 
                        ? 'bg-slate-950/40 border-emerald-500/20 text-emerald-400' 
                        : 'bg-slate-950/40 border-slate-900 text-slate-500'
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] border transition-all duration-300 ${
                      crawledFields.length > 0 
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-extrabold shadow-[0_0_8px_rgba(16,185,129,0.4)]' 
                        : activePage === 'automation'
                        ? 'bg-blue-500/20 text-blue-400 border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)] animate-pulse'
                        : 'bg-slate-900 border-slate-800 text-slate-500'
                    }`}>
                      {crawledFields.length > 0 ? '✓' : '1'}
                    </span>
                    <span>Scrape Website</span>
                  </button>

                  {/* Connecting Line 1-2 */}
                  <div className={`flex-1 h-[2px] rounded transition-all duration-500 ${
                    crawledFields.length > 0 
                      ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]' 
                      : 'bg-slate-900'
                  }`} />

                  {/* Step 2 */}
                  <button 
                    onClick={() => crawledFields.length > 0 && setActivePage('documents')}
                    disabled={crawledFields.length === 0}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all border ${
                      activePage === 'documents' 
                        ? 'bg-blue-500/10 border-blue-500/30 text-blue-400 font-bold scale-105 shadow-[0_0_12px_rgba(59,130,246,0.15)]' 
                        : documentId 
                        ? 'bg-slate-950/40 border-emerald-500/20 text-emerald-400' 
                        : crawledFields.length === 0
                        ? 'bg-slate-950/20 border-slate-950/20 text-slate-700 cursor-not-allowed'
                        : 'bg-slate-950/40 border-slate-900 text-slate-400'
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] border transition-all duration-300 ${
                      documentId 
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-extrabold shadow-[0_0_8px_rgba(16,185,129,0.4)]' 
                        : activePage === 'documents'
                        ? 'bg-blue-500/20 text-blue-400 border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)] animate-pulse'
                        : 'bg-slate-900 border-slate-800 text-slate-500'
                    }`}>
                      {documentId ? '✓' : '2'}
                    </span>
                    <span>Ingest Document</span>
                  </button>

                  {/* Connecting Line 2-3 */}
                  <div className={`flex-1 h-[2px] rounded transition-all duration-500 ${
                    documentId 
                      ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]' 
                      : 'bg-slate-900'
                  }`} />

                  {/* Step 3 */}
                  <button 
                    onClick={() => documentId && setActivePage('verification')}
                    disabled={!documentId}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all border ${
                      activePage === 'verification' 
                        ? 'bg-blue-500/10 border-blue-500/30 text-blue-400 font-bold scale-105 shadow-[0_0_12px_rgba(59,130,246,0.15)]' 
                        : !documentId 
                        ? 'bg-slate-950/20 border-slate-950/20 text-slate-700 cursor-not-allowed'
                        : documentData?.corrected_json 
                        ? 'bg-slate-950/40 border-emerald-500/20 text-emerald-400' 
                        : 'bg-slate-950/40 border-slate-900 text-slate-400'
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] border transition-all duration-300 ${
                      documentData?.corrected_json 
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-extrabold shadow-[0_0_8px_rgba(16,185,129,0.4)]' 
                        : activePage === 'verification'
                        ? 'bg-blue-500/20 text-blue-400 border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)] animate-pulse'
                        : 'bg-slate-900 border-slate-800 text-slate-500'
                    }`}>
                      {documentData?.corrected_json ? '✓' : '3'}
                    </span>
                    <span>Verify Data</span>
                  </button>

                  {/* Connecting Line 3-4 */}
                  <div className={`flex-1 h-[2px] rounded transition-all duration-500 ${
                    documentData?.corrected_json 
                      ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]' 
                      : 'bg-slate-900'
                  }`} />

                  {/* Step 4 */}
                  <button 
                    onClick={() => documentId && setActivePage('automation')}
                    disabled={!documentId}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all border ${
                      activePage === 'automation' && crawledFields.length > 0 && documentId
                        ? 'bg-purple-500/10 border-purple-500/30 text-purple-400 font-bold scale-105 shadow-[0_0_12px_rgba(168,85,247,0.15)]' 
                        : !documentId 
                        ? 'bg-slate-950/20 border-slate-950/20 text-slate-700 cursor-not-allowed'
                        : 'bg-slate-950/40 border-slate-900 text-slate-400'
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] border transition-all duration-300 ${
                      activePage === 'automation' && crawledFields.length > 0 && documentId
                        ? 'bg-purple-500/20 text-purple-400 border-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.4)] animate-pulse'
                        : 'bg-slate-900 border-slate-800 text-slate-500'
                    }`}>
                      4
                    </span>
                    <span>Run Autofill</span>
                  </button>
                </div>
              </div>
            )}
            
            {/* 1. DASHBOARD PAGE */}
            {activePage === 'dashboard' && (
              <div className="flex flex-col gap-6">
                
                {/* 2x3 Grid KPI Cards */}
                <div className="kpi-grid">
                  <div className="kpi-card">
                    <span className="kpi-label">TOTAL DOCUMENTS</span>
                    <span className="kpi-value">{documentsList.length}</span>
                    <span className="kpi-sub">Buffered in repository database</span>
                  </div>

                  <div className="kpi-card">
                    <span className="kpi-label">SUCCESS INJECTION RATE</span>
                    <span className="kpi-value" style={{ color: 'var(--success-color)' }}>
                      {adminMetrics.success_rate_percent}%
                    </span>
                    <span className="kpi-sub">Fields successfully verified</span>
                  </div>

                  <div className="kpi-card">
                    <span className="kpi-label">BACKEND STATUS</span>
                    <span className="kpi-value" style={{ color: backendOnline ? 'var(--success-color)' : 'var(--danger-color)' }}>
                      {backendOnline ? 'ONLINE' : 'OFFLINE'}
                    </span>
                    <span className="kpi-sub">{backendOnline ? 'API service responding normally' : 'Check server status at port 8000'}</span>
                  </div>

                  <div className="kpi-card">
                    <span className="kpi-label">AVG OCR LATENCY</span>
                    <span className="kpi-value">{adminMetrics.avg_ocr_latency_sec}s</span>
                    <span className="kpi-sub">Document text detection speed</span>
                  </div>

                  <div className="kpi-card">
                    <span className="kpi-label">AVG LLM COGNITIVE LATENCY</span>
                    <span className="kpi-value">{adminMetrics.avg_llm_latency_sec}s</span>
                    <span className="kpi-sub">SLM field mapping inference</span>
                  </div>

                  <div className="kpi-card">
                    <span className="kpi-label">ESTIMATED API COST</span>
                    <span className="kpi-value" style={{ color: 'var(--accent-secondary)' }}>
                      ${adminMetrics.estimated_api_cost_usd}
                    </span>
                    <span className="kpi-sub">Accumulated Gemini API credits</span>
                  </div>
                </div>

                {/* Quick actions row */}
                <div className="page-section">
                  <div className="page-section-header">
                    <Sliders className="w-4 h-4 text-orange-500" />
                    <h3>Quick Management Controls</h3>
                  </div>
                  <div className="flex gap-4">
                    <button 
                      onClick={() => setActivePage('documents')}
                      className="btn-premium"
                    >
                      UPLOAD NEW DOCUMENT
                    </button>
                    <button 
                      onClick={() => setActivePage('documents')}
                      className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 rounded text-[11px] font-bold transition-all"
                    >
                      VIEW REPOSITORY FEED
                    </button>
                  </div>
                </div>

                {/* Recent Activity Logs */}
                <div className="page-section">
                  <div className="page-section-header">
                    <Terminal className="w-4 h-4 text-orange-500" />
                    <h3>Recent System Activity Logs</h3>
                  </div>
                  <div className="bg-slate-950 rounded p-4 font-mono text-xs text-emerald-400 flex flex-col gap-1.5 overflow-y-auto max-h-[220px]">
                    {logs.slice(-5).map((log) => (
                      <div className="log-line" key={log.id}>
                        <span className="log-time">[{log.time}]</span>
                        <span className={`log-tag-${log.type}`}>{log.type.toUpperCase()}: </span>
                        <span className="text-slate-300">{log.message}</span>
                      </div>
                    ))}
                    {logs.length === 0 && <div className="text-slate-600 italic">No telemetry streams captured...</div>}
                  </div>
                </div>

              </div>
            )}

            {/* 2. DOCUMENTS PAGE */}
            {activePage === 'documents' && (
              <div className="flex flex-col gap-6">
                {crawledFields.length === 0 ? (
                  <div className="px-4 py-3 rounded bg-amber-500/5 border border-amber-500/10 flex items-center gap-3 text-[11px] text-amber-400 font-mono">
                    <AlertCircle className="w-4 h-4 text-amber-400 animate-pulse" />
                    <span>💡 TIP: You can crawl a target website first (Step 1) to enable automatic target-guided extraction!</span>
                  </div>
                ) : (
                  <div className="px-4 py-3 rounded bg-emerald-500/5 border border-emerald-500/10 flex items-center gap-3 text-[11px] text-emerald-400 font-mono">
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>✅ TARGET SCHEMA ALIGNED: File upload will extract only the {crawledFields.length} target fields from the website form.</span>
                  </div>
                )}
                <div className="split-panel">
                  
                  {/* Left Side: Ingestor */}
                  <div className="flex flex-col gap-4">
                    {renderIngestorPlugin()}
                  </div>

                  {/* Right Side: Feed */}
                  <div className="flex flex-col gap-4">
                    {renderFeedPlugin()}
                  </div>

                </div>

                {/* Bottom row: Ingest progress tracker */}
                {uploadProgress && (
                  <div className="progress-tracker mt-2 flex flex-col gap-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-slate-700">DOCUMENT INGESTION PROCESSING SEQUENCE:</span>
                      <span className="font-mono text-orange-600 font-bold uppercase">{uploadProgress}</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2.5 rounded overflow-hidden">
                      <div 
                        className="bg-orange-500 h-full transition-all duration-500"
                        style={{
                          width: 
                            uploadProgress === 'uploading' ? '25%' :
                            uploadProgress === 'preprocessing' ? '45%' :
                            uploadProgress === 'ocr' ? '70%' :
                            uploadProgress === 'slm' ? '90%' :
                            uploadProgress === 'completed' ? '100%' : '0%'
                        }}
                      />
                    </div>
                  </div>
                )}

                {selectedDocId && documentData?.status === 'completed' && (
                  <div className="flex justify-center mt-6">
                    <button
                      onClick={() => setActivePage('verification')}
                      className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 hover:scale-105 active:scale-95 text-white rounded font-bold text-xs shadow-lg transition-all flex items-center gap-2"
                    >
                      <span>👉 PROCEED TO STEP 2: VERIFY DATA</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 3. VERIFICATION PAGE */}
            {activePage === 'verification' && (
              <div className="flex flex-col gap-6">
                <div className="page-section">
                  <div className="page-section-header">
                    <Sliders className="w-4 h-4 text-orange-500" />
                    <h3>INTELLIGENT VERIFICATION STUDIO</h3>
                  </div>
                  {renderVerificationPlugin()}
                </div>
              </div>
            )}

            {/* 4. AUTOMATION PAGE */}
            {activePage === 'automation' && (
              <div className="flex flex-col gap-6">
                
                {/* Top: Portal Mapper (Always accessible for Step 1) */}
                <div className="page-section">
                  <div className="page-section-header">
                    <Globe className="w-4 h-4 text-orange-500" />
                    <h3>Portal Mapper</h3>
                  </div>
                  {renderMapperPlugin()}
                </div>

                {/* Middle: Execution controls (Locked if no document selected/verified) */}
                <div className="page-section">
                  <div className="page-section-header">
                    <Play className="w-4 h-4 text-orange-500" />
                    <h3>Execution Engine Control</h3>
                  </div>
                  {!documentId ? (
                    <div className="glass-panel flex flex-col items-center justify-center p-8 text-center bg-slate-950/20 border border-slate-900 rounded">
                      <ShieldAlert className="w-8 h-8 text-amber-500 mb-2 animate-pulse" />
                      <h4 className="text-xs font-mono font-bold text-slate-300">AUTOFILL BLOCKED: SOURCE DATA PENDING</h4>
                      <p className="text-[10px] text-slate-500 max-w-xs mt-1 leading-normal">
                        To trigger form injection, you must first ingest a document (Step 2) and verify its details (Step 3).
                      </p>
                      {crawledFields.length > 0 && (
                        <button 
                          onClick={() => setActivePage('documents')}
                          className="mt-4 px-4 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded text-[9px] font-bold transition-all shadow-md"
                        >
                          GO TO STEP 2: UPLOAD DOCUMENT &rarr;
                        </button>
                      )}
                    </div>
                  ) : (
                    renderExecutionPlugin()
                  )}
                </div>

                {/* Bottom: Evidence Viewer */}
                {fillResult && documentId && (
                  <div className="page-section">
                    <div className="page-section-header">
                      <Monitor className="w-4 h-4 text-purple-500" />
                      <h3>Screen Evidence Viewer</h3>
                    </div>
                    {renderEvidencePlugin()}
                  </div>
                )}
              </div>
            )}

            {/* 5. ADMIN METRICS PAGE */}
            {activePage === 'admin-metrics' && (
              <div className="flex flex-col gap-6">
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Operational Metrics */}
                  <div className="page-section">
                    <div className="page-section-header">
                      <Activity className="w-4 h-4 text-orange-500" />
                      <h3>Operational Metrics</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
                      {[
                        { label: 'Total Ingested', value: adminMetrics.total_documents, color: 'text-slate-800' },
                        { label: 'Success Rate', value: `${adminMetrics.success_rate_percent}%`, color: 'text-emerald-600 font-bold' },
                        { label: 'Error Rate', value: `${adminMetrics.error_rate_percent || 0.0}%`, color: 'text-rose-600' },
                        { label: 'Active Sessions', value: adminMetrics.active_users || 3, color: 'text-purple-600' },
                        { label: 'Daily Requests', value: adminMetrics.daily_requests || 0, color: 'text-blue-600' },
                        { label: 'Active Workers', value: adminMetrics.active_queue_workers, color: 'text-teal-600' }
                      ].map((m, idx) => (
                        <div key={idx} className="bg-slate-50 border border-slate-200 p-3 rounded flex flex-col gap-1">
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{m.label}</span>
                          <span className={`text-sm font-bold ${m.color}`}>{m.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Security Interceptions */}
                  <div className="page-section">
                    <div className="page-section-header">
                      <ShieldAlert className="w-4 h-4 text-rose-500" />
                      <h3>Security Interceptions</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
                      <div className="bg-slate-50 border border-slate-200 p-3 rounded flex flex-col gap-1">
                        <span className="text-[9px] text-slate-500 font-bold uppercase">Malware Quarantined</span>
                        <span className="text-sm text-rose-600 font-bold">{adminMetrics.quarantined_files_blocked} threats</span>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 p-3 rounded flex flex-col gap-1">
                        <span className="text-[9px] text-slate-500 font-bold uppercase">Prompt Injections</span>
                        <span className="text-sm text-amber-600 font-bold">{adminMetrics.prompt_injections_neutralized} blocks</span>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 p-3 rounded flex flex-col gap-1">
                        <span className="text-[9px] text-slate-500 font-bold uppercase">Rate Limit Triggers</span>
                        <span className="text-sm text-orange-600 font-bold">{adminMetrics.rate_limit_429_count} (429s)</span>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 p-3 rounded flex flex-col gap-1">
                        <span className="text-[9px] text-slate-500 font-bold uppercase">Deduplication Hits</span>
                        <span className="text-sm text-emerald-600 font-bold">{adminMetrics.duplicate_cache_hits} inputs</span>
                      </div>
                    </div>
                  </div>

                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Cache Telemetry */}
                  <div className="page-section">
                    <div className="page-section-header">
                      <Database className="w-4 h-4 text-pink-500" />
                      <h3>Cache Telemetry HUD</h3>
                    </div>
                    <div className="flex flex-col gap-2 font-mono text-[11px]">
                      <div className="flex justify-between items-center p-2.5 bg-slate-50 border border-slate-250 rounded">
                        <span className="text-slate-500 font-medium">Cache Service Status:</span>
                        <span className="font-bold text-slate-800">{adminMetrics.cache_service_status || 'InMemory Cache Service'}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <div className="flex flex-col p-2 bg-slate-50 border border-slate-200 rounded text-center">
                          <span className="text-slate-400 text-[8px] uppercase font-bold tracking-wide">Workspace Settings</span>
                          <span className="font-bold text-blue-600 text-[10px] mt-1">10m Cache (Active)</span>
                        </div>
                        <div className="flex flex-col p-2 bg-slate-50 border border-slate-200 rounded text-center">
                          <span className="text-slate-400 text-[8px] uppercase font-bold tracking-wide">API key verify</span>
                          <span className="font-bold text-blue-600 text-[10px] mt-1">10m Cache (Active)</span>
                        </div>
                        <div className="flex flex-col p-2 bg-slate-50 border border-slate-200 rounded text-center">
                          <span className="text-slate-400 text-[8px] uppercase font-bold tracking-wide">OCR Results</span>
                          <span className="font-bold text-blue-600 text-[10px] mt-1">24h Cache (Active)</span>
                        </div>
                        <div className="flex flex-col p-2 bg-slate-50 border border-slate-200 rounded text-center">
                          <span className="text-slate-400 text-[8px] uppercase font-bold tracking-wide">AI Extraction</span>
                          <span className="font-bold text-blue-600 text-[10px] mt-1">30d Cache (Active)</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Cognitive Extraction Metrics */}
                  <div className="page-section">
                    <div className="page-section-header">
                      <Cpu className="w-4 h-4 text-indigo-500" />
                      <h3>Cognitive Extraction Metrics</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
                      <div className="bg-slate-50 border border-slate-200 p-3 rounded flex flex-col gap-1">
                        <span className="text-[9px] text-slate-500 font-bold uppercase">Estimated Month Cost</span>
                        <span className="text-sm text-indigo-600 font-bold">${adminMetrics.monthly_cost_usd || 0.0} USD</span>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 p-3 rounded flex flex-col gap-1">
                        <span className="text-[9px] text-slate-500 font-bold uppercase">Estimated Today Cost</span>
                        <span className="text-sm text-indigo-600 font-bold">${adminMetrics.today_cost_usd || 0.0} USD</span>
                      </div>
                    </div>
                  </div>

                </div>

              </div>
            )}

            {/* 6. ADMIN SETTINGS PAGE */}
            {activePage === 'admin-settings' && (
              <div className="flex flex-col gap-6">
                <div className="page-section">
                  <div className="page-section-header">
                    <Settings className="w-4 h-4 text-orange-500" />
                    <h3>Enterprise Security Config</h3>
                  </div>
                  
                  <div className="flex flex-col gap-6">
                    
                    {/* Rate Limiting */}
                    <div className="settings-group">
                      <h4 className="settings-group-title">Rate Limiting Thresholds</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="flex flex-col gap-1">
                          <div className="flex justify-between text-[11px] font-bold">
                            <span className="text-slate-600">Rate Limit (Per API Key)</span>
                            <span className="text-orange-600 font-mono">{adminSettings.rate_limit_api_key} req/m</span>
                          </div>
                          <input
                            type="range"
                            min="10"
                            max="500"
                            step="10"
                            value={adminSettings.rate_limit_api_key}
                            onChange={(e) => saveAdminSettings({ ...adminSettings, rate_limit_api_key: parseInt(e.target.value) })}
                            className="w-full accent-orange-500 cursor-pointer h-1 rounded-lg"
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <div className="flex justify-between text-[11px] font-bold">
                            <span className="text-slate-600">Rate Limit (Unauth Per IP)</span>
                            <span className="text-orange-600 font-mono">{adminSettings.rate_limit_ip} req/m</span>
                          </div>
                          <input
                            type="range"
                            min="5"
                            max="100"
                            step="5"
                            value={adminSettings.rate_limit_ip}
                            onChange={(e) => saveAdminSettings({ ...adminSettings, rate_limit_ip: parseInt(e.target.value) })}
                            className="w-full accent-orange-500 cursor-pointer h-1 rounded-lg"
                          />
                        </div>
                      </div>
                    </div>

                    {/* File Handling */}
                    <div className="settings-group">
                      <h4 className="settings-group-title">File Ingestion Controls</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="flex flex-col gap-1">
                          <div className="flex justify-between text-[11px] font-bold">
                            <span className="text-slate-600">Max File Size Limit</span>
                            <span className="text-blue-600 font-mono">{adminSettings.max_file_size_mb} MB</span>
                          </div>
                          <input
                            type="range"
                            min="1"
                            max="100"
                            step="1"
                            value={adminSettings.max_file_size_mb}
                            onChange={(e) => saveAdminSettings({ ...adminSettings, max_file_size_mb: parseInt(e.target.value) })}
                            className="w-full accent-blue-500 cursor-pointer h-1 rounded-lg"
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <div className="flex justify-between text-[11px] font-bold">
                            <span className="text-slate-600">Allowed Ingestion Extensions</span>
                          </div>
                          <input
                            type="text"
                            value={adminSettings.allowed_extensions.join(', ')}
                            onChange={(e) => saveAdminSettings({ ...adminSettings, allowed_extensions: e.target.value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) })}
                            className="input-glass text-xs py-1.5 px-2 mt-1"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Timeouts & Retention */}
                    <div className="settings-group">
                      <h4 className="settings-group-title">System Timeouts & Retention</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold text-slate-600">OCR Engine Timeout (seconds)</span>
                          <input
                            type="number"
                            value={adminSettings.timeout_ocr_sec}
                            onChange={(e) => saveAdminSettings({ ...adminSettings, timeout_ocr_sec: parseInt(e.target.value) || 60 })}
                            className="input-glass text-xs py-1.5 px-2 mt-1"
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold text-slate-600">LLM Cognitive Timeout (seconds)</span>
                          <input
                            type="number"
                            value={adminSettings.timeout_llm_sec}
                            onChange={(e) => saveAdminSettings({ ...adminSettings, timeout_llm_sec: parseInt(e.target.value) || 90 })}
                            className="input-glass text-xs py-1.5 px-2 mt-1"
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <div className="flex justify-between text-[11px] font-bold">
                            <span className="text-slate-600">Data Retention Mode</span>
                            <span className="text-blue-600 font-mono">{adminSettings.data_retention_days} days</span>
                          </div>
                          <input
                            type="range"
                            min="7"
                            max="365"
                            step="7"
                            value={adminSettings.data_retention_days}
                            onChange={(e) => saveAdminSettings({ ...adminSettings, data_retention_days: parseInt(e.target.value) })}
                            className="w-full accent-blue-500 cursor-pointer h-1 rounded-lg"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Security Features */}
                    <div className="settings-group">
                      <h4 className="settings-group-title">Security Shield Features</h4>
                      <div className="flex flex-col gap-3">
                        {[
                          { key: 'virus_scanning_enabled', label: 'Enable ClamAV Anti-Malware & Ingestion Quarantine Scanning' },
                          { key: 'prompt_injection_protection', label: 'Enable Precompiled System Override Prompt Injection Protection' },
                          { key: 'duplicate_detection_sha256', label: 'Enable Request Deduplication Cache (SHA-256)' }
                        ].map(item => (
                          <label key={item.key} className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-600">
                            <input
                              type="checkbox"
                              checked={adminSettings[item.key]}
                              onChange={(e) => saveAdminSettings({ ...adminSettings, [item.key]: e.target.checked })}
                              className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                            />
                            <span>{item.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Webhooks */}
                    <div className="settings-group">
                      <h4 className="settings-group-title">Webhook Callbacks</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold text-slate-600">Callback Endpoint URL</span>
                          <input
                            type="text"
                            placeholder="https://client-system.com/webhooks"
                            value={adminSettings.webhook_url}
                            onChange={(e) => saveAdminSettings({ ...adminSettings, webhook_url: e.target.value })}
                            className="input-glass text-xs py-1.5 px-2 mt-1"
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <div className="flex justify-between text-[10px] font-bold">
                            <span className="text-slate-600">Webhook Signature Secret (HMAC-SHA256)</span>
                            <button 
                              onClick={() => saveAdminSettings({ ...adminSettings, webhook_secret: `unitive_hmac_${Math.random().toString(36).substring(2, 10)}` })}
                              className="text-[9px] text-orange-600 font-mono font-bold hover:underline"
                            >
                              [ROTATE SECRET]
                            </button>
                          </div>
                          <input
                            type="text"
                            value={adminSettings.webhook_secret}
                            onChange={(e) => saveAdminSettings({ ...adminSettings, webhook_secret: e.target.value })}
                            className="input-glass text-xs font-mono py-1.5 px-2 mt-1"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Cloud Integrations */}
                    <div className="settings-group">
                      <h4 className="settings-group-title">Cloud Integrations (Primary AI & OCR)</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold text-slate-600">Google Gemini API Key</span>
                          <input
                            type="password"
                            placeholder="AIzaSy..."
                            value={adminSettings.gemini_api_key || ''}
                            onChange={(e) => saveAdminSettings({ ...adminSettings, gemini_api_key: e.target.value })}
                            className="input-glass text-xs py-1.5 px-2 mt-1"
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold text-slate-600">Google Cloud Project ID</span>
                          <input
                            type="text"
                            placeholder="gcp-project-123"
                            value={adminSettings.gcp_project_id || ''}
                            onChange={(e) => saveAdminSettings({ ...adminSettings, gcp_project_id: e.target.value })}
                            className="input-glass text-xs py-1.5 px-2 mt-1"
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold text-slate-600">Google Cloud Location</span>
                          <input
                            type="text"
                            placeholder="us or eu"
                            value={adminSettings.gcp_location || 'us'}
                            onChange={(e) => saveAdminSettings({ ...adminSettings, gcp_location: e.target.value })}
                            className="input-glass text-xs py-1.5 px-2 mt-1"
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold text-slate-600">Document AI Processor ID</span>
                          <input
                            type="text"
                            placeholder="processor-id-hex"
                            value={adminSettings.docai_processor_id || ''}
                            onChange={(e) => saveAdminSettings({ ...adminSettings, docai_processor_id: e.target.value })}
                            className="input-glass text-xs py-1.5 px-2 mt-1"
                          />
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            )}

            {/* 7. ADMIN API KEYS PAGE */}
            {activePage === 'admin-keys' && (
              <div className="flex flex-col gap-6">
                <div className="page-section">
                  <div className="page-section-header">
                    <Key className="w-4 h-4 text-orange-500" />
                    <h3>Workspace API Keys Management</h3>
                  </div>

                  <div className="flex flex-col gap-4">
                    <div className="bg-slate-50 border border-slate-200 rounded p-4 flex flex-col gap-3">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">Issue New Workspace Key</span>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <input
                          type="text"
                          placeholder="Workspace Name (e.g. ERP Retail)"
                          value={newKeyWorkspace}
                          onChange={(e) => setNewKeyWorkspace(e.target.value)}
                          className="input-glass text-xs py-1.5 px-2"
                        />
                        <input
                          type="text"
                          placeholder="Key Name (e.g. Production server)"
                          value={newKeyName}
                          onChange={(e) => setNewKeyName(e.target.value)}
                          className="input-glass text-xs py-1.5 px-2"
                        />
                        <select
                          value={newKeyRole}
                          onChange={(e) => setNewKeyRole(e.target.value)}
                          className="bg-white border border-slate-200 text-xs rounded px-2.5 py-1.5 text-slate-600 focus:outline-none"
                        >
                          <option value="Admin">Admin</option>
                          <option value="Developer">Developer</option>
                          <option value="Read Only">Read Only</option>
                          <option value="Billing">Billing</option>
                        </select>
                      </div>

                      <div className="flex justify-end">
                        <button
                          onClick={handleCreateAPIKey}
                          className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded text-[10px] font-bold transition-colors"
                        >
                          GENERATE API KEY
                        </button>
                      </div>
                    </div>

                    {newlyCreatedKey && (
                      <div className="p-4 bg-emerald-50 border border-emerald-200 rounded text-emerald-800 text-xs flex flex-col gap-2 font-mono">
                        <span className="font-bold text-emerald-700 uppercase">[!] SECURE PLAIN-TEXT API KEY GENERATED:</span>
                        <div className="flex gap-2 items-center bg-white border border-emerald-200 p-2 rounded">
                          <span className="text-emerald-900 font-bold select-all flex-1 text-xs truncate">{newlyCreatedKey.raw_key}</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(newlyCreatedKey.raw_key);
                              alert("Plaintext key copied! Save it now. It will not be shown again.");
                            }}
                            className="px-3.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded text-[10px] font-bold"
                          >
                            COPY KEY
                          </button>
                        </div>
                        <span className="text-[9px] text-emerald-600">This key is hashed using SHA-256 before storage. Keep it safe. Plaintext cannot be recovered.</span>
                      </div>
                    )}

                    <div className="overflow-x-auto border border-slate-200 rounded bg-white">
                      <table className="min-w-full divide-y divide-slate-250 text-xs">
                        <thead className="bg-slate-50 font-mono">
                          <tr>
                            <th className="px-4 py-2.5 text-left text-[9px] font-bold text-slate-500 uppercase">Descriptor</th>
                            <th className="px-4 py-2.5 text-left text-[9px] font-bold text-slate-500 uppercase">Workspace</th>
                            <th className="px-4 py-2.5 text-left text-[9px] font-bold text-slate-500 uppercase">Prefix</th>
                            <th className="px-4 py-2.5 text-left text-[9px] font-bold text-slate-500 uppercase">Role</th>
                            <th className="px-4 py-2.5 text-left text-[9px] font-bold text-slate-500 uppercase">State</th>
                            <th className="px-4 py-2.5 text-right text-[9px] font-bold text-slate-500 uppercase">Control</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-150 font-mono">
                          {adminKeys.map((k) => (
                            <tr key={k.key_id} className="hover:bg-slate-50">
                              <td className="px-4 py-2.5 font-semibold text-slate-700">{k.name}</td>
                              <td className="px-4 py-2.5 text-slate-500 truncate max-w-[150px]">{k.workspace}</td>
                              <td className="px-4 py-2.5 text-slate-600 font-bold">{k.prefix}</td>
                              <td className="px-4 py-2.5">
                                <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase ${
                                  k.role === 'Admin' ? 'bg-red-50 text-red-600 border border-red-100' :
                                  k.role === 'Developer' ? 'bg-blue-50 text-blue-600 border border-blue-100' :
                                  k.role === 'Billing' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                                  'bg-slate-50 text-slate-600 border border-slate-100'
                                }`}>
                                  {k.role}
                                </span>
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase ${
                                  k.status === 'active' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'
                                }`}>
                                  {k.status}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <div className="flex justify-end gap-1.5">
                                  {k.status === 'active' && (
                                    <>
                                      <button
                                        onClick={() => handleRotateKey(k.key_id)}
                                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded text-[9px] font-bold text-slate-600"
                                      >
                                        ROTATE
                                      </button>
                                      <button
                                        onClick={() => handleRevokeKey(k.key_id)}
                                        className="px-2 py-1 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded text-[9px] font-bold text-rose-600"
                                      >
                                        REVOKE
                                      </button>
                                    </>
                                  )}
                                  <button
                                    onClick={() => handleDeleteKey(k.key_id)}
                                    className="p-1 text-slate-400 hover:text-rose-500 rounded"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 8. ADMIN AUDIT LOGS PAGE */}
            {activePage === 'admin-logs' && (
              <div className="flex flex-col gap-6">
                <div className="page-section">
                  <div className="page-section-header justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-orange-500" />
                      <h3>Security Audit Logs</h3>
                    </div>
                    <button
                      onClick={handleClearAdminLogs}
                      className="text-[10px] font-mono text-red-500 hover:underline border-none bg-transparent cursor-pointer font-bold"
                    >
                      [PURGE AUDIT LOG DATABASE]
                    </button>
                  </div>

                  <div className="bg-slate-950 text-slate-300 font-mono text-xs rounded p-4 overflow-y-auto max-h-[480px] flex flex-col gap-2">
                    {adminLogs.length === 0 ? (
                      <div className="text-slate-600 italic">No security events triggered. Shield secure.</div>
                    ) : (
                      adminLogs.map((log, idx) => {
                        let badgeColor = 'text-slate-400 border border-slate-800 bg-slate-900';
                        if (log.event_type === 'quarantine' || log.level === 'WARNING' || log.event_type === 'injection') badgeColor = 'text-red-400 border border-red-950 bg-red-950/20';
                        else if (log.event_type === 'ratelimit') badgeColor = 'text-orange-400 border border-orange-950 bg-orange-950/20';
                        else if (log.event_type === 'auth') badgeColor = 'text-purple-400 border border-purple-950 bg-purple-950/20';
                        else if (log.event_type === 'audit') badgeColor = 'text-emerald-400 border border-emerald-950 bg-emerald-950/20';
                        else if (log.event_type === 'config') badgeColor = 'text-blue-400 border border-blue-950 bg-blue-950/20';

                        return (
                          <div key={idx} className="flex gap-3 items-start py-1 border-b border-slate-900 last:border-0 font-mono">
                            <span className="text-slate-600 font-semibold">{log.timestamp?.slice(11, 19) || ''}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase shrink-0 ${badgeColor}`}>
                              {log.event_type || 'system'}
                            </span>
                            <span className="flex-1 text-slate-200">{log.message}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 9. LIVE CONSOLE PAGE */}
            {activePage === 'console' && (
              <div className="flex flex-col gap-6">
                <div className="page-section">
                  <div className="page-section-header justify-between">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-orange-500" />
                      <h3>Live Engine Console Stream</h3>
                    </div>
                    <button 
                      onClick={() => setLogs([])}
                      className="text-[10px] font-mono text-slate-400 hover:underline border-none bg-transparent cursor-pointer font-bold"
                    >
                      [CLEAR CONSOLE]
                    </button>
                  </div>

                  <div className="bg-slate-950 rounded p-4 font-mono text-xs text-emerald-400 flex flex-col gap-1.5 overflow-y-auto h-[480px]">
                    {logs.map((log) => (
                      <div className="log-line" key={log.id}>
                        <span className="log-time">[{log.time}]</span>
                        <span className={`log-tag-${log.type}`}>{log.type.toUpperCase()}: </span>
                        <span className="text-slate-300">{log.message}</span>
                      </div>
                    ))}
                    {logs.length === 0 && <div className="text-slate-600 italic">No telemetry streams captured...</div>}
                    <div ref={logEndRef} />
                  </div>
                </div>
              </div>
            )}

          </div>

        </main>

      </div>

      {/* Corporate Verification Summary Modal */}
      {showScreenshot && fillResult && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel max-w-4xl w-full flex flex-col overflow-hidden max-h-[90vh] bg-slate-950 border border-slate-800 rounded">
            <div className="p-4 border-b border-slate-900 flex justify-between items-center bg-slate-950">
              <div className={`flex items-center gap-2 ${fillResult.success ? 'text-emerald-400' : 'text-rose-400'} font-mono`}>
                {fillResult.success ? (
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-rose-400" />
                )}
                <span className="font-bold text-xs uppercase tracking-wider">Verification Execution Summary Report</span>
              </div>
              <button 
                onClick={() => {
                  setShowScreenshot(false);
                  setBulkResult(null);
                }}
                className="px-3.5 py-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded text-xs font-mono font-semibold text-slate-300 transition-colors"
              >
                [CLOSE_REPORT]
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex flex-col gap-6">
              
              {/* Tabular summary list if bulkResult is present */}
              {bulkResult ? (
                <div className="flex flex-col gap-4">
                  <div className="p-4 rounded bg-blue-500/5 border border-blue-500/10 flex justify-between items-center font-mono text-[11px]">
                    <div>
                      <h4 className="text-xs font-bold text-blue-400">BATCH TRANSACTION AGENT LOG</h4>
                      <p className="text-[10px] text-slate-500 mt-0.5">Execution Summary metrics of bulk automated invoice injection.</p>
                    </div>
                  </div>
                  
                  <div className="overflow-x-auto border border-slate-900 rounded bg-slate-950">
                    <table className="summary-table-wrapper font-mono" style={{ marginTop: 0 }}>
                      <thead>
                        <tr className="bg-slate-900 text-slate-400 font-bold">
                          <th className="summary-table-header text-[9px] border-b border-slate-900">Row</th>
                          <th className="summary-table-header text-[9px] border-b border-slate-900">Record Identity</th>
                          <th className="summary-table-header text-[9px] border-b border-slate-900">Validation State</th>
                          <th className="summary-table-header text-[9px] border-b border-slate-900">Execution Comments</th>
                          <th className="summary-table-header text-[9px] border-b border-slate-900 text-right">Evidence Link</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const docData = documentData?.corrected_json || documentData?.extracted_json || {};
                          const records = docData.records || [];
                          return bulkResult.results?.map((res, i) => {
                            const recName = res.customer_name || records[res.record_index]?.full_name || records[res.record_index]?.name || `Record ${res.record_index + 1}`;
                            const screenshotUrl = res.screenshot_url || `/static/screenshots/screenshot_bulk_${res.record_index}.png`;
                            return (
                              <tr key={i} className="summary-table-row">
                                <td className="summary-table-cell text-slate-400">#{res.record_index + 1}</td>
                                <td className="summary-table-cell font-medium text-slate-200">{recName}</td>
                                <td className="summary-table-cell">
                                  <span className={`badge ${res.success ? 'badge-completed' : 'badge-failed'}`}>
                                    {res.success ? 'success' : 'failed'}
                                  </span>
                                </td>
                                <td className="summary-table-cell text-slate-400">
                                  {res.success ? 'injected successfully' : res.errors?.join('; ') || 'Record validation failed'}
                                </td>
                                <td className="summary-table-cell text-right">
                                  <a 
                                    href={screenshotUrl} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="text-indigo-400 hover:text-indigo-300 font-semibold underline"
                                  >
                                    View Frame
                                  </a>
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* Single verification success / failure comment */
                <div className={`p-4 rounded-xl flex items-center gap-3 ${
                  fillResult.success 
                    ? 'bg-emerald-500/5 border border-emerald-500/10' 
                    : 'bg-rose-500/5 border border-rose-500/10'
                }`}>
                  {fillResult.success ? (
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-rose-400" />
                  )}
                  <div>
                    <h4 className={`text-xs font-bold ${fillResult.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {fillResult.success ? 'success' : 'failed'}
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {fillResult.success 
                        ? 'injected successfully' 
                        : fillResult.errors?.join('; ') || 'Record validation failed'}
                    </p>
                  </div>
                </div>
              )}
              
              {/* Form Render Viewport */}
              <div className="flex flex-col gap-2 font-mono">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">CAPTURED SCREEN EVIDENCE:</span>
                <div className="border border-slate-900 rounded overflow-hidden shadow-2xl bg-black/60 flex justify-center p-2">
                  <img 
                    src={fillResult.screenshot_url} 
                    alt="Automation Frame"
                    className="w-full h-auto max-h-[75vh] object-contain rounded cursor-pointer hover:opacity-90 transition-opacity"
                    title="Click to view full size image"
                    onClick={() => window.open(fillResult.screenshot_url, '_blank')}
                    onError={(e) => {
                      e.target.src = 'https://raw.githubusercontent.com/microsoft/playwright/main/packages/playwright-core/src/server/chromium/video.png';
                    }}
                  />
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}