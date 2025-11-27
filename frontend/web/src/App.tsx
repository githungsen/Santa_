import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface SecretSantaData {
  id: string;
  name: string;
  encryptedValue: any;
  publicValue1: number;
  publicValue2: number;
  description: string;
  creator: string;
  timestamp: number;
  isVerified: boolean;
  decryptedValue: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [santas, setSantas] = useState<SecretSantaData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingSanta, setCreatingSanta] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newSantaData, setNewSantaData] = useState({ name: "", giftValue: "", participants: "" });
  const [selectedSanta, setSelectedSanta] = useState<SecretSantaData | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const santasList: SecretSantaData[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          santasList.push({
            id: businessId,
            name: businessData.name,
            encryptedValue: null,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            description: businessData.description,
            creator: businessData.creator,
            timestamp: Number(businessData.timestamp),
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading business data:', e);
        }
      }
      
      setSantas(santasList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const createSanta = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingSanta(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating Secret Santa with FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const giftValue = parseInt(newSantaData.giftValue) || 0;
      const businessId = `santa-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, giftValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newSantaData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        parseInt(newSantaData.participants) || 0,
        0,
        "Secret Santa Exchange"
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Secret Santa created!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewSantaData({ name: "", giftValue: "", participants: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected" 
        : "Creation failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingSanta(false); 
    }
  };

  const decryptData = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) return null;
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        setTransactionStatus({ visible: true, status: "success", message: "Data already verified" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        return Number(businessData.decryptedValue) || 0;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "Data decrypted successfully!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ visible: true, status: "success", message: "Data is already verified" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        await loadData();
        return null;
      }
      
      setTransactionStatus({ visible: true, status: "error", message: "Decryption failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      setTransactionStatus({ visible: true, status: "success", message: "Contract is available!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Availability check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const filteredSantas = santas.filter(santa => 
    santa.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    santa.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const paginatedSantas = filteredSantas.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPages = Math.ceil(filteredSantas.length / itemsPerPage);

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>🎄 Secret Santa FHE</h1>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🎁</div>
            <h2>Connect Your Wallet for Secret Santa</h2>
            <p>Join the encrypted gift exchange where no one knows who gives to whom!</p>
            <div className="connection-steps">
              <div className="step">
                <span>1</span>
                <p>Connect your wallet to start</p>
              </div>
              <div className="step">
                <span>2</span>
                <p>FHE system initializes automatically</p>
              </div>
              <div className="step">
                <span>3</span>
                <p>Create or join encrypted Secret Santa exchanges</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE Encryption...</p>
        <p className="loading-note">Preparing secure gift matching</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading Secret Santa exchanges...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>🎄 Secret Santa FHE</h1>
          <p>Encrypted Gift Exchange</p>
        </div>
        
        <div className="header-actions">
          <button onClick={checkAvailability} className="availability-btn">
            Check Availability
          </button>
          <button onClick={() => setShowCreateModal(true)} className="create-btn">
            + New Exchange
          </button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>
      
      <div className="main-content">
        <div className="stats-panels">
          <div className="stat-panel">
            <h3>Total Exchanges</h3>
            <div className="stat-value">{santas.length}</div>
          </div>
          <div className="stat-panel">
            <h3>Verified Matches</h3>
            <div className="stat-value">{santas.filter(s => s.isVerified).length}</div>
          </div>
          <div className="stat-panel">
            <h3>Active Participants</h3>
            <div className="stat-value">{santas.reduce((sum, s) => sum + s.publicValue1, 0)}</div>
          </div>
        </div>

        <div className="search-section">
          <input
            type="text"
            placeholder="Search exchanges..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          <button onClick={loadData} className="refresh-btn" disabled={isRefreshing}>
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="santas-grid">
          {paginatedSantas.map((santa, index) => (
            <div 
              className={`santa-card ${santa.isVerified ? 'verified' : ''}`}
              key={index}
              onClick={() => setSelectedSanta(santa)}
            >
              <div className="card-header">
                <h3>{santa.name}</h3>
                <span className={`status ${santa.isVerified ? 'verified' : 'pending'}`}>
                  {santa.isVerified ? '✅ Verified' : '🔓 Pending'}
                </span>
              </div>
              <div className="card-content">
                <p>{santa.description}</p>
                <div className="santa-meta">
                  <span>Participants: {santa.publicValue1}</span>
                  <span>Created: {new Date(santa.timestamp * 1000).toLocaleDateString()}</span>
                </div>
                {santa.isVerified && santa.decryptedValue > 0 && (
                  <div className="gift-value">
                    Gift Value: {santa.decryptedValue}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {totalPages > 1 && (
          <div className="pagination">
            <button 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </button>
            <span>Page {currentPage} of {totalPages}</span>
            <button 
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </button>
          </div>
        )}

        <div className="faq-section">
          <h3>How It Works</h3>
          <div className="faq-grid">
            <div className="faq-item">
              <h4>🎁 Create Exchange</h4>
              <p>Set up a new Secret Santa with encrypted gift values</p>
            </div>
            <div className="faq-item">
              <h4>🔐 FHE Encryption</h4>
              <p>Gift values are encrypted using Zama FHE technology</p>
            </div>
            <div className="faq-item">
              <h4>🎯 Random Matching</h4>
              <p>Participants are matched randomly without revealing pairs</p>
            </div>
            <div className="faq-item">
              <h4>✅ Secure Verification</h4>
              <p>Verify matches on-chain while keeping values private</p>
            </div>
          </div>
        </div>
      </div>
      
      {showCreateModal && (
        <ModalCreateSanta 
          onSubmit={createSanta} 
          onClose={() => setShowCreateModal(false)} 
          creating={creatingSanta} 
          santaData={newSantaData} 
          setSantaData={setNewSantaData}
          isEncrypting={isEncrypting}
        />
      )}
      
      {selectedSanta && (
        <SantaDetailModal 
          santa={selectedSanta} 
          onClose={() => setSelectedSanta(null)} 
          isDecrypting={isDecrypting || fheIsDecrypting} 
          decryptData={() => decryptData(selectedSanta.id)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const ModalCreateSanta: React.FC<{
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  santaData: any;
  setSantaData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, creating, santaData, setSantaData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'giftValue') {
      const intValue = value.replace(/[^\d]/g, '');
      setSantaData({ ...santaData, [name]: intValue });
    } else {
      setSantaData({ ...santaData, [name]: value });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="create-santa-modal">
        <div className="modal-header">
          <h2>New Secret Santa Exchange</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <strong>FHE 🔐 Gift Value Encryption</strong>
            <p>Gift values are encrypted with Zama FHE (Integer only)</p>
          </div>
          
          <div className="form-group">
            <label>Exchange Name *</label>
            <input 
              type="text" 
              name="name" 
              value={santaData.name} 
              onChange={handleChange} 
              placeholder="Christmas Party 2024..." 
            />
          </div>
          
          <div className="form-group">
            <label>Gift Value (Integer) *</label>
            <input 
              type="number" 
              name="giftValue" 
              value={santaData.giftValue} 
              onChange={handleChange} 
              placeholder="Enter gift value..." 
              step="1"
              min="0"
            />
            <div className="data-type-label">FHE Encrypted</div>
          </div>
          
          <div className="form-group">
            <label>Number of Participants *</label>
            <input 
              type="number" 
              min="2" 
              name="participants" 
              value={santaData.participants} 
              onChange={handleChange} 
              placeholder="How many participants?" 
            />
            <div className="data-type-label">Public Data</div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || isEncrypting || !santaData.name || !santaData.giftValue || !santaData.participants} 
            className="submit-btn"
          >
            {creating || isEncrypting ? "Encrypting..." : "Create Exchange"}
          </button>
        </div>
      </div>
    </div>
  );
};

const SantaDetailModal: React.FC<{
  santa: SecretSantaData;
  onClose: () => void;
  isDecrypting: boolean;
  decryptData: () => Promise<number | null>;
}> = ({ santa, onClose, isDecrypting, decryptData }) => {
  const handleDecrypt = async () => {
    await decryptData();
  };

  return (
    <div className="modal-overlay">
      <div className="santa-detail-modal">
        <div className="modal-header">
          <h2>Secret Santa Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="santa-info">
            <div className="info-item">
              <span>Exchange Name:</span>
              <strong>{santa.name}</strong>
            </div>
            <div className="info-item">
              <span>Creator:</span>
              <strong>{santa.creator.substring(0, 6)}...{santa.creator.substring(38)}</strong>
            </div>
            <div className="info-item">
              <span>Participants:</span>
              <strong>{santa.publicValue1}</strong>
            </div>
            <div className="info-item">
              <span>Created:</span>
              <strong>{new Date(santa.timestamp * 1000).toLocaleDateString()}</strong>
            </div>
          </div>
          
          <div className="data-section">
            <h3>Encrypted Gift Matching</h3>
            
            <div className="data-row">
              <div className="data-label">Gift Value:</div>
              <div className="data-value">
                {santa.isVerified && santa.decryptedValue ? 
                  `${santa.decryptedValue} (Verified)` : 
                  "🔒 FHE Encrypted"
                }
              </div>
              <button 
                className={`decrypt-btn ${santa.isVerified ? 'verified' : ''}`}
                onClick={handleDecrypt} 
                disabled={isDecrypting}
              >
                {isDecrypting ? "Decrypting..." : santa.isVerified ? "✅ Verified" : "🔓 Verify"}
              </button>
            </div>
            
            <div className="fhe-info">
              <div className="fhe-icon">🔐</div>
              <div>
                <strong>FHE Protected Matching</strong>
                <p>Gift values remain encrypted until verification. Participants never see who gives to whom.</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
        </div>
      </div>
    </div>
  );
};

export default App;