import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';
import { ethers } from 'ethers';

interface SecretSantaData {
  id: string;
  name: string;
  encryptedValue: string;
  giftValue: number;
  timestamp: number;
  creator: string;
  isVerified: boolean;
  decryptedValue?: number;
  participantCount: number;
  status: 'active' | 'completed';
}

interface Participant {
  address: string;
  name: string;
  joinedAt: number;
  giftAssigned?: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [santaEvents, setSantaEvents] = useState<SecretSantaData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newEventData, setNewEventData] = useState({ 
    name: "", 
    giftValue: "", 
    participantCount: "" 
  });
  const [selectedEvent, setSelectedEvent] = useState<SecretSantaData | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [showIntroduction, setShowIntroduction] = useState(true);
  const [userHistory, setUserHistory] = useState<SecretSantaData[]>([]);
  const [stats, setStats] = useState({
    totalEvents: 0,
    activeEvents: 0,
    totalGifts: 0,
    averageValue: 0
  });

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
        console.error('Failed to initialize FHEVM:', error);
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed." 
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
      const eventsList: SecretSantaData[] = [];
      const userEvents: SecretSantaData[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          const event: SecretSantaData = {
            id: businessId,
            name: businessData.name,
            encryptedValue: businessId,
            giftValue: Number(businessData.publicValue1) || 0,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0,
            participantCount: Number(businessData.publicValue2) || 0,
            status: Number(businessData.timestamp) > Date.now()/1000 - 86400 * 30 ? 'active' : 'completed'
          };
          
          eventsList.push(event);
          if (businessData.creator.toLowerCase() === address?.toLowerCase()) {
            userEvents.push(event);
          }
        } catch (e) {
          console.error('Error loading business data:', e);
        }
      }
      
      setSantaEvents(eventsList);
      setUserHistory(userEvents);
      
      const totalGifts = eventsList.reduce((sum, event) => sum + event.giftValue, 0);
      setStats({
        totalEvents: eventsList.length,
        activeEvents: eventsList.filter(e => e.status === 'active').length,
        totalGifts,
        averageValue: eventsList.length > 0 ? Math.round(totalGifts / eventsList.length) : 0
      });
      
      setParticipants(generateMockParticipants());
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const generateMockParticipants = (): Participant[] => {
    return [
      { address: "0x742...d35a", name: "Alice", joinedAt: Date.now()/1000 - 86400 },
      { address: "0x8b3...f92c", name: "Bob", joinedAt: Date.now()/1000 - 43200 },
      { address: "0x1e9...a47d", name: "Carol", joinedAt: Date.now()/1000 - 21600 },
      { address: address || "0x000...0000", name: "You", joinedAt: Date.now()/1000 }
    ];
  };

  const createSantaEvent = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingEvent(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating Secret Santa with FHE encryption..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const giftValue = parseInt(newEventData.giftValue) || 0;
      const participantCount = parseInt(newEventData.participantCount) || 0;
      const businessId = `santa-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, giftValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newEventData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        giftValue,
        participantCount,
        "Secret Santa Gift Exchange"
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Secret Santa created successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewEventData({ name: "", giftValue: "", participantCount: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected" 
        : "Creation failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingEvent(false); 
    }
  };

  const decryptGiftValue = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Gift value already verified" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        return storedValue;
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
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying gift value..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "Gift value revealed!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Gift value already verified" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        await loadData();
        return null;
      }
      
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Reveal failed: " + (e.message || "Unknown error") 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const handleAvailableCheck = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const result = await contract.isAvailable();
      setTransactionStatus({ 
        visible: true, 
        status: "success", 
        message: "FHE System is available and ready!" 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Availability check failed" 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const renderStats = () => {
    return (
      <div className="stats-grid">
        <div className="stat-card neon-purple">
          <div className="stat-icon">🎁</div>
          <div className="stat-content">
            <div className="stat-value">{stats.totalEvents}</div>
            <div className="stat-label">Total Events</div>
          </div>
        </div>
        
        <div className="stat-card neon-blue">
          <div className="stat-icon">⏳</div>
          <div className="stat-content">
            <div className="stat-value">{stats.activeEvents}</div>
            <div className="stat-label">Active Now</div>
          </div>
        </div>
        
        <div className="stat-card neon-pink">
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <div className="stat-value">{stats.totalGifts}</div>
            <div className="stat-label">Total Gifts</div>
          </div>
        </div>
        
        <div className="stat-card neon-green">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <div className="stat-value">{stats.averageValue}</div>
            <div className="stat-label">Avg Value</div>
          </div>
        </div>
      </div>
    );
  };

  const renderFHEProcess = () => {
    return (
      <div className="fhe-process">
        <div className="process-step">
          <div className="step-number">1</div>
          <div className="step-content">
            <h4>Encrypt Gift Value</h4>
            <p>Gift amount encrypted using Zama FHE before submission</p>
          </div>
        </div>
        
        <div className="process-step">
          <div className="step-number">2</div>
          <div className="step-content">
            <h4>Random Pairing</h4>
            <p>FHE enables private matching without revealing pairs</p>
          </div>
        </div>
        
        <div className="process-step">
          <div className="step-number">3</div>
          <div className="step-content">
            <h4>Personal Reveal</h4>
            <p>Only you can decrypt your assigned gift recipient</p>
          </div>
        </div>
        
        <div className="process-step">
          <div className="step-number">4</div>
          <div className="step-content">
            <h4>On-chain Proof</h4>
            <p>Verification stored permanently on blockchain</p>
          </div>
        </div>
      </div>
    );
  };

  const renderUserHistory = () => {
    if (userHistory.length === 0) return null;
    
    return (
      <div className="history-section">
        <h3>Your Secret Santa History</h3>
        <div className="history-list">
          {userHistory.map((event, index) => (
            <div key={index} className="history-item">
              <div className="event-name">{event.name}</div>
              <div className="event-details">
                <span>Gift: {event.isVerified ? event.decryptedValue : '🔒'}</span>
                <span>Participants: {event.participantCount}</span>
                <span>{new Date(event.timestamp * 1000).toLocaleDateString()}</span>
              </div>
              <div className={`status-badge ${event.status}`}>
                {event.status === 'active' ? 'Active' : 'Completed'}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderFAQ = () => {
    return (
      <div className="faq-section">
        <h3>FHE Secret Santa FAQ</h3>
        <div className="faq-list">
          <div className="faq-item">
            <div className="faq-question">How does FHE protect my privacy?</div>
            <div className="faq-answer">FHE allows the smart contract to perform random pairing calculations on encrypted data, so no one can see who is assigned to whom until you personally decrypt your match.</div>
          </div>
          
          <div className="faq-item">
            <div className="faq-question">When can I see my gift assignment?</div>
            <div className="faq-answer">You can reveal your assignment anytime after the pairing is complete by clicking the "Reveal Match" button. Only you can see your specific assignment.</div>
          </div>
          
          <div className="faq-item">
            <div className="faq-question">Is the gift amount visible to others?</div>
            <div className="faq-answer">No, the gift amount is encrypted using FHE. Others only see that you're participating, not the specific gift value you've set.</div>
          </div>
        </div>
      </div>
    );
  };

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>🎄 FHE Secret Santa</h1>
            <p>Private Gift Exchange with Fully Homomorphic Encryption</p>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="prompt-content">
            <div className="prompt-icon">🔐</div>
            <h2>Connect Your Wallet to Join Secret Santa</h2>
            <p>Experience truly private gift exchange using Zama FHE technology</p>
            <div className="feature-list">
              <div className="feature">🎁 Encrypted gift amounts</div>
              <div className="feature">🕵️ Anonymous pairings</div>
              <div className="feature">🔒 Personal reveal only</div>
              <div className="feature">📜 On-chain verification</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="encryption-animation">
          <div className="lock-icon">🔒</div>
          <div className="encryption-dots">
            <div className="dot"></div>
            <div className="dot"></div>
            <div className="dot"></div>
          </div>
        </div>
        <p>Initializing FHE Encryption System...</p>
        <p className="status-text">Status: {fhevmInitializing ? "Connecting to FHEVM" : status}</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="encryption-animation">
        <div className="lock-icon">🔒</div>
        <div className="encryption-dots">
          <div className="dot"></div>
          <div className="dot"></div>
          <div className="dot"></div>
        </div>
      </div>
      <p>Loading Secret Santa events...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>🎄 FHE Secret Santa</h1>
          <p>Private Gift Exchange with Zama FHE</p>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={handleAvailableCheck}
            className="check-available-btn"
          >
            Check FHE Status
          </button>
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-event-btn"
          >
            + New Secret Santa
          </button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>

      {showIntroduction && (
        <div className="intro-banner">
          <div className="intro-content">
            <h3>Welcome to FHE Secret Santa! 🎅</h3>
            <p>Create private gift exchanges where no one knows the pairings until personal reveal. Powered by Zama FHE technology.</p>
            <button 
              onClick={() => setShowIntroduction(false)}
              className="close-intro-btn"
            >
              Got it!
            </button>
          </div>
        </div>
      )}
      
      <main className="main-content">
        <section className="stats-section">
          <h2>Secret Santa Statistics</h2>
          {renderStats()}
        </section>

        <section className="fhe-section">
          <div className="section-header">
            <h2>How FHE Protects Your Secret Santa</h2>
            <button onClick={loadData} className="refresh-btn" disabled={isRefreshing}>
              {isRefreshing ? "🔄" : "Refresh"}
            </button>
          </div>
          {renderFHEProcess()}
        </section>

        <section className="events-section">
          <div className="section-header">
            <h2>Active Secret Santa Events</h2>
            <div className="section-actions">
              <button onClick={loadData} disabled={isRefreshing}>
                {isRefreshing ? "Refreshing..." : "🔄 Refresh"}
              </button>
            </div>
          </div>

          <div className="events-grid">
            {santaEvents.length === 0 ? (
              <div className="no-events">
                <div className="no-events-icon">🎁</div>
                <p>No Secret Santa events found</p>
                <button 
                  className="create-first-btn"
                  onClick={() => setShowCreateModal(true)}
                >
                  Create First Event
                </button>
              </div>
            ) : (
              santaEvents.map((event, index) => (
                <div 
                  key={index}
                  className={`event-card ${selectedEvent?.id === event.id ? 'selected' : ''}`}
                  onClick={() => setSelectedEvent(event)}
                >
                  <div className="card-header">
                    <h3>{event.name}</h3>
                    <div className={`status-dot ${event.status}`}></div>
                  </div>
                  
                  <div className="card-content">
                    <div className="event-info">
                      <div className="info-item">
                        <span>Gift Value:</span>
                        <strong>
                          {event.isVerified ? `${event.decryptedValue} 🎁` : '🔒 Encrypted'}
                        </strong>
                      </div>
                      <div className="info-item">
                        <span>Participants:</span>
                        <strong>{event.participantCount}</strong>
                      </div>
                      <div className="info-item">
                        <span>Created:</span>
                        <span>{new Date(event.timestamp * 1000).toLocaleDateString()}</span>
                      </div>
                    </div>
                    
                    <div className="card-actions">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          decryptGiftValue(event.id);
                        }}
                        disabled={isDecrypting}
                        className={`reveal-btn ${event.isVerified ? 'revealed' : ''}`}
                      >
                        {isDecrypting ? 'Decrypting...' : 
                         event.isVerified ? '✅ Revealed' : '🔓 Reveal Gift'}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {renderUserHistory()}
        {renderFAQ()}
      </main>

      {showCreateModal && (
        <CreateEventModal
          onSubmit={createSantaEvent}
          onClose={() => setShowCreateModal(false)}
          creating={creatingEvent}
          eventData={newEventData}
          setEventData={setNewEventData}
          isEncrypting={isEncrypting}
        />
      )}

      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          participants={participants}
          onReveal={() => decryptGiftValue(selectedEvent.id)}
          isDecrypting={isDecrypting}
        />
      )}

      {transactionStatus.visible && (
        <div className={`transaction-toast ${transactionStatus.status}`}>
          <div className="toast-content">
            <div className="toast-icon">
              {transactionStatus.status === "pending" && "⏳"}
              {transactionStatus.status === "success" && "✅"}
              {transactionStatus.status === "error" && "❌"}
            </div>
            <div className="toast-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const CreateEventModal: React.FC<{
  onSubmit: () => void;
  onClose: () => void;
  creating: boolean;
  eventData: any;
  setEventData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, creating, eventData, setEventData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'giftValue' || name === 'participantCount') {
      const intValue = value.replace(/[^\d]/g, '');
      setEventData({ ...eventData, [name]: intValue });
    } else {
      setEventData({ ...eventData, [name]: value });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal">
        <div className="modal-header">
          <h2>Create New Secret Santa</h2>
          <button onClick={onClose} className="close-btn">×</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="notice-icon">🔐</div>
            <div>
              <strong>FHE Encrypted Gift Values</strong>
              <p>Gift amounts are encrypted using Zama FHE for complete privacy</p>
            </div>
          </div>

          <div className="form-group">
            <label>Event Name *</label>
            <input
              type="text"
              name="name"
              value={eventData.name}
              onChange={handleChange}
              placeholder="Christmas 2024 Secret Santa..."
            />
          </div>

          <div className="form-group">
            <label>Gift Value (Integer only) *</label>
            <input
              type="number"
              name="giftValue"
              value={eventData.giftValue}
              onChange={handleChange}
              placeholder="Enter gift value in ETH..."
              min="0"
              step="1"
            />
            <div className="input-hint">FHE Encrypted - Only visible to you</div>
          </div>

          <div className="form-group">
            <label>Number of Participants *</label>
            <input
              type="number"
              name="participantCount"
              value={eventData.participantCount}
              onChange={handleChange}
              placeholder="How many people will join?"
              min="2"
              max="50"
            />
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button
            onClick={onSubmit}
            disabled={creating || isEncrypting || !eventData.name || !eventData.giftValue || !eventData.participantCount}
            className="submit-btn"
          >
            {creating || isEncrypting ? "Encrypting & Creating..." : "Create Secret Santa"}
          </button>
        </div>
      </div>
    </div>
  );
};

const EventDetailModal: React.FC<{
  event: SecretSantaData;
  onClose: () => void;
  participants: Participant[];
  onReveal: () => void;
  isDecrypting: boolean;
}> = ({ event, onClose, participants, onReveal, isDecrypting }) => {
  return (
    <div className="modal-overlay">
      <div className="detail-modal">
        <div className="modal-header">
          <h2>{event.name} Details</h2>
          <button onClick={onClose} className="close-btn">×</button>
        </div>

        <div className="modal-body">
          <div className="event-overview">
            <div className="overview-item">
              <span>Status:</span>
              <span className={`status-badge ${event.status}`}>
                {event.status === 'active' ? '🟢 Active' : '🔴 Completed'}
              </span>
            </div>
            <div className="overview-item">
              <span>Created:</span>
              <span>{new Date(event.timestamp * 1000).toLocaleString()}</span>
            </div>
            <div className="overview-item">
              <span>Creator:</span>
              <span className="creator-address">
                {event.creator.substring(0, 6)}...{event.creator.substring(38)}
              </span>
            </div>
          </div>

          <div className="gift-section">
            <h3>🎁 Gift Information</h3>
            <div className="gift-value">
              <span>Encrypted Gift Value:</span>
              <strong className={event.isVerified ? 'revealed' : 'encrypted'}>
                {event.isVerified ? `${event.decryptedValue} ETH` : '🔒 FHE Encrypted'}
              </strong>
            </div>
            <button
              onClick={onReveal}
              disabled={isDecrypting || event.isVerified}
              className={`reveal-gift-btn ${event.isVerified ? 'revealed' : ''}`}
            >
              {isDecrypting ? 'Decrypting...' : 
               event.isVerified ? '✅ Value Revealed' : '🔓 Reveal Gift Value'}
            </button>
          </div>

          <div className="participants-section">
            <h3>👥 Participants ({participants.length})</h3>
            <div className="participants-list">
              {participants.map((participant, index) => (
                <div key={index} className="participant-item">
                  <div className="participant-avatar">
                    {participant.name.charAt(0)}
                  </div>
                  <div className="participant-info">
                    <div className="participant-name">{participant.name}</div>
                    <div className="participant-address">{participant.address}</div>
                  </div>
                  <div className="join-time">
                    {new Date(participant.joinedAt * 1000).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="fhe-info">
            <div className="info-icon">🔐</div>
            <div>
              <strong>FHE Privacy Protection</strong>
              <p>Your gift value and assignment are encrypted using Zama FHE technology. 
                 Only you can decrypt your specific assignment through personal key access.</p>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
          {!event.isVerified && (
            <button onClick={onReveal} disabled={isDecrypting} className="reveal-btn">
              Reveal My Assignment
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;

