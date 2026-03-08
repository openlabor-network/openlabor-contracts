// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./OpenLaborSmartWallet.sol";

/// @title OpenLaborWalletFactory
/// @notice Deploys OpenLaborSmartWallet instances and manages session keys.
contract OpenLaborWalletFactory {
    address public admin;
    address public pendingAdmin;

    mapping(address => address[]) private _wallets;

    event WalletCreated(address indexed owner, address indexed wallet, uint256 index);
    event AdminTransferStarted(address indexed currentAdmin, address indexed newAdmin);
    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function createWallet() external returns (address) {
        OpenLaborSmartWallet wallet = new OpenLaborSmartWallet(msg.sender, address(this));
        address walletAddr = address(wallet);

        uint256 index = _wallets[msg.sender].length;
        _wallets[msg.sender].push(walletAddr);

        emit WalletCreated(msg.sender, walletAddr, index);
        return walletAddr;
    }

    /// @notice Set a session key on a wallet created by this factory.
    function setSessionKey(address walletAddr, address key, uint256 expiresAt) external {
        OpenLaborSmartWallet wallet = OpenLaborSmartWallet(payable(walletAddr));
        require(wallet.factory() == address(this), "Wallet not from this factory");
        require(msg.sender == admin || msg.sender == wallet.owner(), "Not authorized");

        wallet.addSessionKey(key, expiresAt);
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Invalid address");
        pendingAdmin = newAdmin;
        emit AdminTransferStarted(admin, newAdmin);
    }

    function acceptAdmin() external {
        require(msg.sender == pendingAdmin, "Not pending admin");
        emit AdminTransferred(admin, msg.sender);
        admin = msg.sender;
        pendingAdmin = address(0);
    }

    function getWallets(address walletOwner) external view returns (address[] memory) {
        return _wallets[walletOwner];
    }

    function getWallet(address walletOwner, uint256 index) external view returns (address) {
        require(index < _wallets[walletOwner].length, "Index out of bounds");
        return _wallets[walletOwner][index];
    }

    function getWalletCount(address walletOwner) external view returns (uint256) {
        return _wallets[walletOwner].length;
    }
}
