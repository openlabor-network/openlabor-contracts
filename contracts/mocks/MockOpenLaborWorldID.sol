// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev Mock for testing. Accepts any proof.
contract MockOpenLaborWorldID {
    function verifyProof(
        uint256,
        uint256,
        uint256,
        uint256,
        uint256,
        uint256[8] calldata
    ) external pure {}
}
