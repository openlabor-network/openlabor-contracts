// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface ISignatureTransfer {
    struct TokenPermissions {
        address token;
        uint256 amount;
    }

    struct PermitTransferFrom {
        TokenPermissions permitted;
        uint256 nonce;
        uint256 deadline;
    }

    struct SignatureTransferDetails {
        address to;
        uint256 requestedAmount;
    }

    function permitTransferFrom(
        PermitTransferFrom calldata permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes calldata signature
    ) external;
}

/// @title OpenLaborEscrow
/// @notice Holds USDC in escrow for jobs. Clients deposit via Permit2, platform
///         assigns workers, then releases or refunds. Owner-operated.
contract OpenLaborEscrow {
    enum EscrowStatus { None, Funded, Released, Refunded }

    struct EscrowInfo {
        address client;
        address worker;
        uint256 amount;
        EscrowStatus status;
    }

    address public owner;
    address public pendingOwner;
    IERC20 public usdcToken;
    ISignatureTransfer public permit2;

    mapping(bytes32 => EscrowInfo) public escrows;

    event JobFunded(bytes32 indexed jobId, address indexed client, uint256 amount);
    event WorkerAssigned(bytes32 indexed jobId, address indexed worker);
    event PaymentReleased(bytes32 indexed jobId, address indexed worker, uint256 amount);
    event PaymentRefunded(bytes32 indexed jobId, address indexed client, uint256 amount);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _usdcToken, address _permit2) {
        require(_usdcToken != address(0), "Invalid USDC address");
        require(_permit2 != address(0), "Invalid Permit2 address");
        owner = msg.sender;
        usdcToken = IERC20(_usdcToken);
        permit2 = ISignatureTransfer(_permit2);
    }

    /// @notice Client deposits USDC for a job via Permit2 signature.
    function depositForJob(
        bytes32 jobId,
        uint256 amount,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external {
        require(escrows[jobId].status == EscrowStatus.None, "Job already funded");
        require(amount > 0, "Amount must be > 0");

        ISignatureTransfer.PermitTransferFrom memory permitData = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({
                token: address(usdcToken),
                amount: amount
            }),
            nonce: nonce,
            deadline: deadline
        });

        ISignatureTransfer.SignatureTransferDetails memory details = ISignatureTransfer.SignatureTransferDetails({
            to: address(this),
            requestedAmount: amount
        });

        permit2.permitTransferFrom(permitData, details, msg.sender, signature);

        escrows[jobId] = EscrowInfo({
            client: msg.sender,
            worker: address(0),
            amount: amount,
            status: EscrowStatus.Funded
        });

        emit JobFunded(jobId, msg.sender, amount);
    }

    function assignWorker(bytes32 jobId, address worker) external onlyOwner {
        EscrowInfo storage info = escrows[jobId];
        require(info.status == EscrowStatus.Funded, "Not funded");
        require(worker != address(0), "Invalid worker address");

        info.worker = worker;
        emit WorkerAssigned(jobId, worker);
    }

    /// @notice Release escrowed funds to the assigned worker.
    function releasePayment(bytes32 jobId) external onlyOwner {
        EscrowInfo storage info = escrows[jobId];
        require(info.status == EscrowStatus.Funded, "Not funded");
        require(info.worker != address(0), "No worker assigned");

        info.status = EscrowStatus.Released;
        require(usdcToken.transfer(info.worker, info.amount), "Transfer failed");

        emit PaymentReleased(jobId, info.worker, info.amount);
    }

    /// @notice Refund escrowed funds back to the client.
    function refundClient(bytes32 jobId) external onlyOwner {
        EscrowInfo storage info = escrows[jobId];
        require(info.status == EscrowStatus.Funded, "Not funded");

        info.status = EscrowStatus.Refunded;
        require(usdcToken.transfer(info.client, info.amount), "Transfer failed");

        emit PaymentRefunded(jobId, info.client, info.amount);
    }

    function getJobEscrow(bytes32 jobId) external view returns (
        address client,
        address worker,
        uint256 amount,
        EscrowStatus status
    ) {
        EscrowInfo storage info = escrows[jobId];
        return (info.client, info.worker, info.amount, info.status);
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
