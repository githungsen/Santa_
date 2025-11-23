# FHE-based Secret Santa 🎁

FHE-based Secret Santa is a privacy-preserving application that transforms the traditional gift exchange experience into a secure and confidential event, powered by Zama's Fully Homomorphic Encryption (FHE) technology. By encrypting participant pairings, this application ensures that each participant is only aware of their own match, maintaining the joy and surprise integral to the holiday spirit.

## The Problem

In typical Secret Santa exchanges, participants must disclose their identities and preferences, exposing personal information that could be misused. The reliance on cleartext data poses significant privacy risks, as it could lead to unwanted solicitation, data leaks, or social discomfort. Thus, traditional approaches fail to protect the confidential nature of not only the participants' identities but also their preferences and gift choices.

## The Zama FHE Solution

Fully Homomorphic Encryption (FHE) allows computations to be performed directly on encrypted data without revealing the underlying information. With Zama's innovative libraries, we can effectively encrypt participant information and compute pairings securely. Using fhevm to process encrypted inputs, we ensure that only the final pairing results are revealed to each participant. This unique approach creates an environment where privacy is guaranteed, enabling users to engage freely without fear of exposure.

## Key Features

- 🤝 **Anonymous Pairing**: Participants remain unaware of others' identities, enhancing the surprise element.
- 🔒 **Secure Computation**: Pairing logic is applied on encrypted data, ensuring confidentiality throughout the process.
- 🎉 **Fun and Interactive**: A festive experience that keeps the holiday spirit alive, integrating playful interactions.
- 🔑 **One-way Decryption**: Results are decrypted in a way that only the intended recipient can see their match, preserving anonymity.

## Technical Architecture & Stack

The FHE-based Secret Santa application is built around the following technical stack:

- **Frontend**: JavaScript, React
- **Backend**: Node.js
- **Privacy Engine**: Zama's fhevm for encrypted computations
- **Database**: Encrypted storage (e.g., MongoDB)
- **Deployment**: Docker for containerization

By leveraging Zama's libraries, we can maintain a strong focus on user privacy while delivering a delightful experience.

## Smart Contract / Core Logic

Below is a simplified pseudo-code example reflecting how Zama's FHE technology facilitates the secure pairing logic.solidity
// Solidity contract example for secret Santa pairing
contract SecretSanta {
    function createPairing(uint64[] encryptedParticipants) public view returns (uint64) {
        // Encrypt the pairing logic using TFHE
        uint64 encryptedPair = TFHE.add(encryptedParticipants[0], encryptedParticipants[1]);
        return encryptedPair; // Only the participant can decrypt their pairing
    }
   
    function revealPairing(uint64 encryptedPair) public view returns (address) {
        return TFHE.decrypt(encryptedPair); // Only the recipient can see their match
    }
}

In this code, we simulate anonymized pairing by using encrypted data inputs and results, showcasing the core functionality of the application.

## Directory Structure

Here’s a structured view of the project:
FHE-based-Secret-Santa/
├── contracts/
│   └── SecretSanta.sol
├── src/
│   ├── index.js
│   ├── SantaApp.js
├── scripts/
│   └── pairingLogic.py
├── package.json
└── README.md

This structure highlights essential components of the application, including the smart contract and the main application files.

## Installation & Setup

### Prerequisites

- Node.js and npm installed
- Docker (for deployment)
- Knowledge of JavaScript and Solidity

### Installation Steps

1. Install the necessary dependencies:bash
   npm install

2. Install Zama's libraries:bash
   npm install fhevm

3. For Python scripts, install the library:bash
   pip install concrete-ml

Following these steps will prepare your development environment for building and running the application.

## Build & Run

To compile the smart contract and run the application, execute the following commands:

1. Compile the smart contract:bash
   npx hardhat compile

2. Start the application:bash
   npm start

3. To run Python scripts for pairing logic:bash
   python scripts/pairingLogic.py

By using these commands, you can test the application locally and experience the secure Secret Santa exchange.

## Acknowledgements

We would like to extend our gratitude to Zama for providing the open-source FHE primitives that make this project possible. Their commitment to privacy and security is the backbone of our application, allowing us to create engaging and secure interactions in the digital space.

---

With FHE-based Secret Santa, we embrace the holiday spirit while ensuring privacy and security in gift exchanges. Join us in enhancing social interactions through innovative cryptographic solutions showcased by Zama's cutting-edge technology.

