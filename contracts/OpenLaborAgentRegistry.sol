// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IOpenLaborWorldID {
    function verifyProof(
        uint256 root,
        uint256 groupId,
        uint256 signalHash,
        uint256 nullifierHash,
        uint256 externalNullifierHash,
        uint256[8] calldata proof
    ) external view;
}

library OpenLaborByteHasher {
    function hashToField(bytes memory value) internal pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(value))) >> 8;
    }
}

/// @title OpenLaborAgentRegistry
/// @notice Registers agents verified as unique humans via WorldID ZK proofs.
///         Each agent maps to a nullifier hash to prevent sybil attacks.
contract OpenLaborAgentRegistry {
    using OpenLaborByteHasher for bytes;

    error InvalidConfiguration();
    error InvalidNonce();

    event AgentRegistered(address indexed agent, uint256 indexed humanId);
    event RegistryInitialized(IOpenLaborWorldID worldIdRouter, uint256 groupId, uint256 externalNullifierHash);
    event WorldIdRouterUpdated(IOpenLaborWorldID worldIdRouter);
    event GroupIdUpdated(uint256 groupId);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    IOpenLaborWorldID public worldIdRouter;
    uint256 public groupId;
    uint256 immutable EXTERNAL_NULLIFIER_HASH;
    address public owner;
    address public pendingOwner;

    mapping(address => uint256) public lookupHuman;
    mapping(address => uint256) public getNextNonce;

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(IOpenLaborWorldID _worldIdRouter, uint256 _groupId, uint256 _externalNullifierHash) {
        if (address(_worldIdRouter) == address(0)) revert InvalidConfiguration();

        owner = msg.sender;
        groupId = _groupId;
        worldIdRouter = _worldIdRouter;
        EXTERNAL_NULLIFIER_HASH = _externalNullifierHash;

        emit RegistryInitialized(worldIdRouter, groupId, EXTERNAL_NULLIFIER_HASH);
    }

    /// @notice Register an agent address with a valid WorldID proof.
    function register(
        address agent,
        uint256 root,
        uint256 nonce,
        uint256 nullifierHash,
        uint256[8] calldata proof
    ) external {
        if (nonce != getNextNonce[agent]) revert InvalidNonce();

        worldIdRouter.verifyProof(
            root,
            groupId,
            abi.encodePacked(agent, nonce).hashToField(),
            nullifierHash,
            EXTERNAL_NULLIFIER_HASH,
            proof
        );

        getNextNonce[agent] = nonce + 1;
        lookupHuman[agent] = nullifierHash;

        emit AgentRegistered(agent, nullifierHash);
    }

    function setWorldIdRouter(IOpenLaborWorldID _worldIdRouter) external onlyOwner {
        if (address(_worldIdRouter) == address(0)) revert InvalidConfiguration();
        worldIdRouter = _worldIdRouter;
        emit WorldIdRouterUpdated(_worldIdRouter);
    }

    function setGroupId(uint256 _groupId) external onlyOwner {
        groupId = _groupId;
        emit GroupIdUpdated(_groupId);
    }

    /// @notice Two-step ownership transfer.
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        pendingOwner = newOwner;
    }

    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "Not pending owner");
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }
}
