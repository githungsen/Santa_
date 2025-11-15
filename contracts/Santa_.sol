pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract SecretSanta is ZamaEthereumConfig {
    struct Participant {
        address addr;
        euint32 encryptedAssignment;
        uint32 decryptedAssignment;
        bool isRevealed;
    }

    mapping(address => Participant) public participants;
    address[] public participantList;

    event ParticipantJoined(address indexed participant);
    event AssignmentRevealed(address indexed participant, uint32 assignment);

    constructor() ZamaEthereumConfig() {}

    function joinWithEncryptedAssignment(externalEuint32 encryptedAssignment, bytes calldata inputProof) external {
        require(participants[msg.sender].addr == address(0), "Already joined");
        require(FHE.isInitialized(FHE.fromExternal(encryptedAssignment, inputProof)), "Invalid encrypted input");

        euint32 encrypted = FHE.fromExternal(encryptedAssignment, inputProof);
        FHE.allowThis(encrypted);
        FHE.makePubliclyDecryptable(encrypted);

        participants[msg.sender] = Participant({
            addr: msg.sender,
            encryptedAssignment: encrypted,
            decryptedAssignment: 0,
            isRevealed: false
        });
        participantList.push(msg.sender);

        emit ParticipantJoined(msg.sender);
    }

    function revealAssignment(bytes memory abiEncodedClearValue, bytes memory decryptionProof) external {
        require(participants[msg.sender].addr != address(0), "Not a participant");
        require(!participants[msg.sender].isRevealed, "Assignment already revealed");

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(participants[msg.sender].encryptedAssignment);

        FHE.checkSignatures(cts, abiEncodedClearValue, decryptionProof);

        uint32 decodedValue = abi.decode(abiEncodedClearValue, (uint32));
        participants[msg.sender].decryptedAssignment = decodedValue;
        participants[msg.sender].isRevealed = true;

        emit AssignmentRevealed(msg.sender, decodedValue);
    }

    function getEncryptedAssignment(address participant) external view returns (euint32) {
        require(participants[participant].addr != address(0), "Not a participant");
        return participants[participant].encryptedAssignment;
    }

    function getParticipantInfo(address participant) external view returns (
        uint32 decryptedAssignment,
        bool isRevealed
    ) {
        require(participants[participant].addr != address(0), "Not a participant");
        return (participants[participant].decryptedAssignment, participants[participant].isRevealed);
    }

    function getAllParticipants() external view returns (address[] memory) {
        return participantList;
    }

    function isAvailable() public pure returns (bool) {
        return true;
    }
}

