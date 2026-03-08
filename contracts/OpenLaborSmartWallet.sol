// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title OpenLaborSmartWallet
/// @notice Smart wallet with time-limited session keys and EIP-1271 signature validation.
contract OpenLaborSmartWallet {
    address public immutable owner;
    address public immutable factory;

    bytes4 private constant EIP1271_MAGIC_VALUE = 0x1626ba7e;
    uint256 public constant MAX_SESSION_DURATION = 365 days;

    struct SessionKey {
        bool active;
        uint256 expiresAt;
    }

    mapping(address => SessionKey) public sessionKeys;

    event SessionKeyAdded(address indexed key, uint256 expiresAt);
    event SessionKeyRevoked(address indexed key);

    constructor(address _owner, address _factory) {
        require(_owner != address(0), "Invalid owner");
        require(_factory != address(0), "Invalid factory");
        owner = _owner;
        factory = _factory;
    }

    modifier onlyOwnerOrFactory() {
        require(msg.sender == owner || msg.sender == factory, "Not authorized");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    function addSessionKey(address key, uint256 expiresAt) external onlyOwnerOrFactory {
        require(key != address(0), "Invalid key");
        require(key != owner, "Cannot set owner as session key");
        require(expiresAt > block.timestamp, "Already expired");
        require(expiresAt <= block.timestamp + MAX_SESSION_DURATION, "Expiration too far");

        sessionKeys[key] = SessionKey(true, expiresAt);
        emit SessionKeyAdded(key, expiresAt);
    }

    function revokeSessionKey(address key) external onlyOwner {
        delete sessionKeys[key];
        emit SessionKeyRevoked(key);
    }

    function isSessionKeyActive(address key) public view returns (bool) {
        SessionKey memory sk = sessionKeys[key];
        return sk.active && block.timestamp < sk.expiresAt;
    }

    /// @notice EIP-1271 signature check. Accepts owner or active session key signatures.
    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        if (signature.length != 65) return 0xffffffff;

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;

        address recovered = ecrecover(hash, v, r, s);

        if (recovered == owner) return EIP1271_MAGIC_VALUE;
        if (isSessionKeyActive(recovered)) return EIP1271_MAGIC_VALUE;

        return 0xffffffff;
    }

    receive() external payable {}
}
