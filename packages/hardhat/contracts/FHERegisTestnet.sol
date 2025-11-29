// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint256, externalEuint256} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title FHERegisTestnet
 * @dev Stores encrypted emails for testnet registration using FHE.
 *      Users can update their email anytime, while the contract tracks total registrations.
 */
contract FHERegisTestnet is SepoliaConfig {
    /// @dev Stores encrypted emails per user
    mapping(address => euint256) private encryptedEmails;

    /// @dev Tracks whether a user has ever registered
    mapping(address => bool) private registered;

    /// @dev Total number of unique registered users
    uint256 public totalRegistered;

    /**
     * @notice Register or update your encrypted email for testnet.
     * @param encryptedEmail The encrypted email (euint256)
     * @param zkProof Zero-knowledge proof for validity
     */
    function registerEmail(externalEuint256 encryptedEmail, bytes calldata zkProof) external {
        bool firstTime = !registered[msg.sender];

        // Convert external euint256 to internal
        euint256 storedEmail = FHE.fromExternal(encryptedEmail, zkProof);

        encryptedEmails[msg.sender] = storedEmail;
        registered[msg.sender] = true;

        // Allow decryption for user and contract
        FHE.allow(encryptedEmails[msg.sender], msg.sender);
        FHE.allowThis(encryptedEmails[msg.sender]);

        // Increment total registered if first time
        if (firstTime) {
            totalRegistered += 1;
        }
    }

    /**
     * @notice Check total unique registered users
     * @return The total number of registered users
     */
    function getTotalRegistered() external view returns (uint256) {
        return totalRegistered;
    }

    /**
     * @notice Check if a user has registered
     * @param user The address to check
     * @return True if the user has registered before
     */
    function hasRegistered(address user) external view returns (bool) {
        return registered[user];
    }

    /**
     * @notice Get the encrypted email of a user
     * @param user The address to query
     * @return The encrypted email (only decryptable by user or contract)
     */
    function encryptedEmailOf(address user) external view returns (euint256) {
        return encryptedEmails[user];
    }
}
