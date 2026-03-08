// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../OpenLaborEscrow.sol";

/// @dev Mock Permit2 that just does a simple transferFrom instead of signature verification.
contract MockPermit2 {
    function permitTransferFrom(
        ISignatureTransfer.PermitTransferFrom calldata permit,
        ISignatureTransfer.SignatureTransferDetails calldata transferDetails,
        address permitOwner,
        bytes calldata
    ) external {
        // Simulate Permit2 by doing a direct transferFrom on the token
        (bool ok, ) = permit.permitted.token.call(
            abi.encodeWithSignature(
                "transferFrom(address,address,uint256)",
                permitOwner,
                transferDetails.to,
                transferDetails.requestedAmount
            )
        );
        require(ok, "MockPermit2: transferFrom failed");
    }
}
