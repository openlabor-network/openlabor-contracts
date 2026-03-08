const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("OpenLaborEscrow", function () {
  let escrow, usdc, permit2, owner, client, worker, rando;
  const JOB = ethers.id("job-001");
  const AMOUNT = 500_000_000; // 500 USDC (6 decimals)

  beforeEach(async function () {
    [owner, client, worker, rando] = await ethers.getSigners();

    const USDC = await ethers.getContractFactory("MockUSDC");
    usdc = await USDC.deploy();
    await usdc.waitForDeployment();

    const Permit2 = await ethers.getContractFactory("MockPermit2");
    permit2 = await Permit2.deploy();
    await permit2.waitForDeployment();

    const Escrow = await ethers.getContractFactory("OpenLaborEscrow");
    escrow = await Escrow.deploy(await usdc.getAddress(), await permit2.getAddress());
    await escrow.waitForDeployment();

    // fund client and approve permit2 (mock flow)
    await usdc.mint(client.address, AMOUNT);
    await usdc.connect(client).approve(await permit2.getAddress(), AMOUNT);
  });

  it("rejects zero addresses in constructor", async function () {
    const Escrow = await ethers.getContractFactory("OpenLaborEscrow");
    await expect(Escrow.deploy(ethers.ZeroAddress, await permit2.getAddress())).to.be.revertedWith("Invalid USDC address");
    await expect(Escrow.deploy(await usdc.getAddress(), ethers.ZeroAddress)).to.be.revertedWith("Invalid Permit2 address");
  });

  async function fundJob(jobId, amount) {
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    await escrow.connect(client).depositForJob(jobId, amount || AMOUNT, 0, deadline, "0x");
  }

  describe("deposit", function () {
    it("funds a job and stores escrow info", async function () {
      await fundJob(JOB);

      const info = await escrow.getJobEscrow(JOB);
      expect(info.client).to.equal(client.address);
      expect(info.worker).to.equal(ethers.ZeroAddress);
      expect(info.amount).to.equal(AMOUNT);
      expect(info.status).to.equal(1); // Funded
    });

    it("moves USDC from client to escrow", async function () {
      await fundJob(JOB);
      expect(await usdc.balanceOf(await escrow.getAddress())).to.equal(AMOUNT);
      expect(await usdc.balanceOf(client.address)).to.equal(0);
    });

    it("emits JobFunded", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      await expect(escrow.connect(client).depositForJob(JOB, AMOUNT, 0, deadline, "0x"))
        .to.emit(escrow, "JobFunded").withArgs(JOB, client.address, AMOUNT);
    });

    it("rejects zero amount", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      await expect(
        escrow.connect(client).depositForJob(JOB, 0, 0, deadline, "0x")
      ).to.be.revertedWith("Amount must be > 0");
    });

    it("rejects double funding same job", async function () {
      await fundJob(JOB);
      await usdc.mint(client.address, AMOUNT);
      await usdc.connect(client).approve(await permit2.getAddress(), AMOUNT);

      const deadline = Math.floor(Date.now() / 1000) + 3600;
      await expect(
        escrow.connect(client).depositForJob(JOB, AMOUNT, 0, deadline, "0x")
      ).to.be.revertedWith("Job already funded");
    });
  });

  describe("assign worker", function () {
    beforeEach(async () => fundJob(JOB));

    it("owner assigns worker", async function () {
      await expect(escrow.assignWorker(JOB, worker.address))
        .to.emit(escrow, "WorkerAssigned").withArgs(JOB, worker.address);

      const info = await escrow.getJobEscrow(JOB);
      expect(info.worker).to.equal(worker.address);
    });

    it("rejects zero-address worker", async function () {
      await expect(escrow.assignWorker(JOB, ethers.ZeroAddress)).to.be.revertedWith("Invalid worker address");
    });

    it("rejects non-owner", async function () {
      await expect(escrow.connect(rando).assignWorker(JOB, worker.address)).to.be.revertedWith("Not owner");
    });

    it("rejects assigning on unfunded job", async function () {
      const otherJob = ethers.id("nonexistent");
      await expect(escrow.assignWorker(otherJob, worker.address)).to.be.revertedWith("Not funded");
    });
  });

  describe("release payment", function () {
    beforeEach(async function () {
      await fundJob(JOB);
      await escrow.assignWorker(JOB, worker.address);
    });

    it("sends USDC to worker and marks Released", async function () {
      await escrow.releasePayment(JOB);

      expect(await usdc.balanceOf(worker.address)).to.equal(AMOUNT);
      const info = await escrow.getJobEscrow(JOB);
      expect(info.status).to.equal(2); // Released
    });

    it("emits PaymentReleased", async function () {
      await expect(escrow.releasePayment(JOB))
        .to.emit(escrow, "PaymentReleased").withArgs(JOB, worker.address, AMOUNT);
    });

    it("cant release without worker", async function () {
      const job2 = ethers.id("job-002");
      await usdc.mint(client.address, AMOUNT);
      await usdc.connect(client).approve(await permit2.getAddress(), AMOUNT);
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      await escrow.connect(client).depositForJob(job2, AMOUNT, 0, deadline, "0x");

      await expect(escrow.releasePayment(job2)).to.be.revertedWith("No worker assigned");
    });

    it("cant release twice", async function () {
      await escrow.releasePayment(JOB);
      await expect(escrow.releasePayment(JOB)).to.be.revertedWith("Not funded");
    });

    it("rejects non-owner", async function () {
      await expect(escrow.connect(rando).releasePayment(JOB)).to.be.revertedWith("Not owner");
    });
  });

  describe("refund", function () {
    beforeEach(async () => fundJob(JOB));

    it("sends USDC back to client and marks Refunded", async function () {
      await escrow.refundClient(JOB);

      expect(await usdc.balanceOf(client.address)).to.equal(AMOUNT);
      const info = await escrow.getJobEscrow(JOB);
      expect(info.status).to.equal(3); // Refunded
    });

    it("emits PaymentRefunded", async function () {
      await expect(escrow.refundClient(JOB))
        .to.emit(escrow, "PaymentRefunded").withArgs(JOB, client.address, AMOUNT);
    });

    it("cant refund after release", async function () {
      await escrow.assignWorker(JOB, worker.address);
      await escrow.releasePayment(JOB);
      await expect(escrow.refundClient(JOB)).to.be.revertedWith("Not funded");
    });

    it("cant refund twice", async function () {
      await escrow.refundClient(JOB);
      await expect(escrow.refundClient(JOB)).to.be.revertedWith("Not funded");
    });
  });

  describe("ownership", function () {
    it("two-step transfer", async function () {
      await escrow.transferOwnership(rando.address);
      expect(await escrow.owner()).to.equal(owner.address);

      await escrow.connect(rando).acceptOwnership();
      expect(await escrow.owner()).to.equal(rando.address);
    });

    it("rejects zero address", async function () {
      await expect(escrow.transferOwnership(ethers.ZeroAddress)).to.be.revertedWith("Invalid address");
    });

    it("only pending can accept", async function () {
      await escrow.transferOwnership(rando.address);
      await expect(escrow.connect(client).acceptOwnership()).to.be.revertedWith("Not pending owner");
    });
  });
});
