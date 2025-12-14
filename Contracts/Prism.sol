// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title Primer_Prism_v1.0
 * @author Primer Systems
 * @notice Settlement gateway for Primer x402 ERC-20 payments
 * @dev Handles standard ERC-20 tokens that require approval (EIP-3009 tokens are settled directly by the facilitator)
 */
contract PrimerPrism is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;
    
    // ============================================
    // STATE VARIABLES
    // ============================================
    
    /// @notice Whitelist of addresses that can submit settlements
    mapping(address => bool) public facilitators;
    
    /// @notice Nonce tracking for ERC-20 settlements (prevents replay attacks)
    /// @dev Maps: user address => token address => nonce
    mapping(address => mapping(address => uint256)) public nonces;
    
    /// @notice Fee percentage in basis points (100 = 1%, 10000 = 100%)
    uint256 public feePercentage;
    
    /// @notice Pending fee percentage (for timelock mechanism)
    uint256 public pendingFeePercentage;
    
    /// @notice Timestamp when pending fee can be activated
    uint256 public feeChangeTimestamp;
    
    /// @notice Maximum allowed fee (5%)
    uint256 public constant MAX_FEE = 500; // 5% in basis points
    
    /// @notice Delay required before fee changes take effect
    uint256 public constant FEE_CHANGE_DELAY = 24 hours;
    
    /// @notice Collected fees per token
    mapping(address => uint256) public collectedFees;
    
    // EIP-712 Domain
    bytes32 private constant EIP712_DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    
    // ERC20Payment struct typehash
    bytes32 private constant ERC20_PAYMENT_TYPEHASH = keccak256(
        "ERC20Payment(address token,address from,address to,uint256 value,uint256 nonce,uint256 validAfter,uint256 validBefore)"
    );
    
    // Domain separator (computed once in constructor for gas savings)
    // This prevents cross-chain replay attacks by binding signatures to specific chain ID
    bytes32 private immutable CACHED_DOMAIN_SEPARATOR;
    uint256 private immutable CACHED_CHAIN_ID;
    
    // ============================================
    // EVENTS
    // ============================================
    
    event FacilitatorAdded(address indexed facilitator);
    event FacilitatorRemoved(address indexed facilitator);
    event FeeChangeProposed(uint256 newFee, uint256 activationTime);
    event FeePercentageUpdated(uint256 oldFee, uint256 newFee);
    event FeesWithdrawn(address indexed token, address indexed recipient, uint256 amount);
    
    event ERC20Settlement(
        address indexed token,
        address indexed from,
        address indexed to,
        uint256 value,
        uint256 nonce,
        uint256 fee,
        uint256 timestamp,
        address facilitator
    );
    
    // ============================================
    // ERRORS
    // ============================================
    
    error NotFacilitator();
    error InvalidAddress();
    error InvalidFeePercentage();
    error InvalidSignature();
    error AuthorizationExpired();
    error AuthorizationNotYetValid();
    error NonceAlreadyUsed();
    error ZeroAmount();
    error FeeChangeTooEarly();
    error NoPendingFeeChange();
    
    // ============================================
    // MODIFIERS
    // ============================================
    
    modifier onlyFacilitator() {
        if (!facilitators[msg.sender]) revert NotFacilitator();
        _;
    }
    
    // ============================================
    // CONSTRUCTOR
    // ============================================
    
    constructor() Ownable(msg.sender) {
        facilitators[msg.sender] = true; // Deployer is automatically owner + facilitator
        feePercentage = 0; // Start with no fees
        
        // Cache domain separator for gas optimization
        CACHED_CHAIN_ID = block.chainid;
        CACHED_DOMAIN_SEPARATOR = _buildDomainSeparator();
        
        emit FacilitatorAdded(msg.sender);
    }
    
    // ============================================
    // OWNER FUNCTIONS
    // ============================================
    
    /**
     * @notice Add an address to the facilitator whitelist
     * @param facilitator Address to add
     */
    function addFacilitator(address facilitator) external onlyOwner {
        if (facilitator == address(0)) revert InvalidAddress();
        facilitators[facilitator] = true;
        emit FacilitatorAdded(facilitator);
    }
    
    /**
     * @notice Remove an address from the facilitator whitelist
     * @param facilitator Address to remove
     */
    function removeFacilitator(address facilitator) external onlyOwner {
        facilitators[facilitator] = false;
        emit FacilitatorRemoved(facilitator);
    }
    
    /**
     * @notice Propose a new fee percentage (requires 24 hour delay before activation)
     * @param newFeePercentage New fee in basis points (100 = 1%)
     */
    function proposeFeeChange(uint256 newFeePercentage) external onlyOwner {
        if (newFeePercentage > MAX_FEE) revert InvalidFeePercentage();
        pendingFeePercentage = newFeePercentage;
        feeChangeTimestamp = block.timestamp + FEE_CHANGE_DELAY;
        emit FeeChangeProposed(newFeePercentage, feeChangeTimestamp);
    }
    
    /**
     * @notice Execute a pending fee change (after 24 hour delay)
     */
    function executeFeeChange() external onlyOwner {
        if (feeChangeTimestamp == 0) revert NoPendingFeeChange();
        if (block.timestamp < feeChangeTimestamp) revert FeeChangeTooEarly();
        
        uint256 oldFee = feePercentage;
        feePercentage = pendingFeePercentage;
        
        // Reset pending state
        pendingFeePercentage = 0;
        feeChangeTimestamp = 0;
        
        emit FeePercentageUpdated(oldFee, feePercentage);
    }
    
    /**
     * @notice Withdraw collected fees
     * @param token Token address to withdraw fees from
     * @param recipient Address to receive the fees
     */
    function withdrawFees(address token, address recipient) external onlyOwner nonReentrant {
        if (recipient == address(0)) revert InvalidAddress();
        uint256 amount = collectedFees[token];
        if (amount == 0) return;
        
        collectedFees[token] = 0;
        
        IERC20(token).safeTransfer(recipient, amount);
        
        emit FeesWithdrawn(token, recipient, amount);
    }
    
    /**
     * @notice Pause all settlement operations (emergency use only)
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @notice Unpause settlement operations
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    // ============================================
    // ERC-20 SETTLEMENT
    // ============================================
    
    /**
     * @notice Settle a standard ERC-20 payment using custom authorization
     * @dev Requires user to have approved this contract via token.approve()
     * @param token ERC-20 token address
     * @param from Payer address
     * @param to Recipient address
     * @param value Amount to transfer
     * @param nonce User's current nonce for this token
     * @param validAfter Timestamp after which the authorization is valid
     * @param validBefore Timestamp before which the authorization is valid
     * @param v Signature parameter
     * @param r Signature parameter
     * @param s Signature parameter
     */
    function settleERC20(
        address token,
        address from,
        address to,
        uint256 value,
        uint256 nonce,
        uint256 validAfter,
        uint256 validBefore,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external onlyFacilitator nonReentrant whenNotPaused {
        // Cache timestamp to save gas (read once instead of 3 times)
        uint256 currentTime = block.timestamp;
        
        // Input validation
        if (value == 0) revert ZeroAmount();
        if (to == address(0)) revert InvalidAddress();
        
        // Validate authorization timing and nonce
        _validateAuthorization(validAfter, validBefore, from, token, nonce, currentTime);
        
        // Verify signature
        _verifySignature(token, from, to, value, nonce, validAfter, validBefore, v, r, s);
        
        // Execute transfer with fee handling
        _executeTransferWithFee(token, from, to, value, nonce, currentTime);
    }
    
    /**
     * @notice Validate authorization timing and nonce
     * @dev Internal function to reduce stack depth in main function
     */
    function _validateAuthorization(
        uint256 validAfter,
        uint256 validBefore,
        address from,
        address token,
        uint256 nonce,
        uint256 currentTime
    ) internal {
        if (currentTime < validAfter) revert AuthorizationNotYetValid();
        if (currentTime > validBefore) revert AuthorizationExpired();
        if (nonces[from][token] != nonce) revert NonceAlreadyUsed();
        
        // Increment nonce to prevent replay
        nonces[from][token]++;
    }
    
    /**
     * @notice Verify EIP-712 signature
     * @dev Internal function to reduce stack depth. Uses ECDSA.recover to prevent signature malleability.
     */
    function _verifySignature(
        address token,
        address from,
        address to,
        uint256 value,
        uint256 nonce,
        uint256 validAfter,
        uint256 validBefore,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal view {
        bytes32 structHash = keccak256(
            abi.encode(
                ERC20_PAYMENT_TYPEHASH,
                token,
                from,
                to,
                value,
                nonce,
                validAfter,
                validBefore
            )
        );
        
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR(), structHash)
        );
        
        // Use ECDSA.recover to prevent signature malleability
        address recoveredAddress = digest.recover(v, r, s);
        if (recoveredAddress != from) {
            revert InvalidSignature();
        }
    }
    
    /**
     * @notice Execute token transfer with fee collection
     * @dev Internal function to reduce stack depth
     * @dev Optimized: skips fee calculation and second transfer when feePercentage is 0 (saves ~55,000 gas)
     */
    function _executeTransferWithFee(
        address token,
        address from,
        address to,
        uint256 value,
        uint256 nonce,
        uint256 currentTime
    ) internal {
        if (feePercentage == 0) {
            // Fast path: no fee, single transfer
            IERC20(token).safeTransferFrom(from, to, value);
            emit ERC20Settlement(token, from, to, value, nonce, 0, currentTime, msg.sender);
        } else {
            // Fee path: calculate and collect fee
            uint256 fee = (value * feePercentage) / 10000;
            uint256 amountAfterFee = value - fee;
            
            // Transfer to recipient
            IERC20(token).safeTransferFrom(from, to, amountAfterFee);
            
            // Collect fee
            IERC20(token).safeTransferFrom(from, address(this), fee);
            collectedFees[token] += fee;
            
            emit ERC20Settlement(token, from, to, value, nonce, fee, currentTime, msg.sender);
        }
    }
    
    // ============================================
    // VIEW FUNCTIONS
    // ============================================
    
    /**
     * @notice Get the EIP-712 domain separator
     * @dev Recomputes if chain ID has changed (for fork scenarios)
     * @dev The domain separator binds signatures to this specific contract on this specific chain,
     *      preventing replay attacks across different chains or contract instances
     */
    function DOMAIN_SEPARATOR() public view returns (bytes32) {
        if (block.chainid == CACHED_CHAIN_ID) {
            return CACHED_DOMAIN_SEPARATOR;
        } else {
            return _buildDomainSeparator();
        }
    }
    
    /**
     * @notice Build the EIP-712 domain separator
     * @dev Internal helper for domain separator construction
     */
    function _buildDomainSeparator() private view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                keccak256("Primer"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }
    
    /**
     * @notice Get the current nonce for a user and token
     * @param user User address
     * @param token Token address
     * @return Current nonce
     */
    function getNonce(address user, address token) external view returns (uint256) {
        return nonces[user][token];
    }
    
    /**
     * @notice Check if an address is a facilitator
     * @param facilitator Address to check
     * @return True if the address is a facilitator
     */
    function isFacilitator(address facilitator) external view returns (bool) {
        return facilitators[facilitator];
    }
    
    /**
     * @notice Get pending fee change details
     * @return pending The proposed fee percentage
     * @return activationTime When the fee can be activated (0 if no pending change)
     */
    function getPendingFeeChange() external view returns (uint256 pending, uint256 activationTime) {
        return (pendingFeePercentage, feeChangeTimestamp);
    }
}

