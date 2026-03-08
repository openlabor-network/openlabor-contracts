const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("OpenLaborAgentRegistry", function () {
  let registry, mockWorldID, owner, agent, rando;
  const GROUP_ID = 1;
  const ROOT = 42069;
  const PROOF = [1, 1, 1, 1, 1, 1, 1, 1];

  beforeEach(async function () {
    [owner, agent, rando] = await ethers.getSigners();

    const Mock = await ethers.getContractFactory("MockOpenLaborWorldID");
    mockWorldID = await Mock.deploy();
    await mockWorldID.waitForDeployment();

    const Registry = await ethers.getContractFactory("OpenLaborAgentRegistry");
    registry = await Registry.deploy(await mockWorldID.getAddress(), GROUP_ID, ethers.id("test"));
    await registry.waitForDeployment();

    await registry.addRoot(ROOT);
  });

  it("deploys with correct config", async function () {
    expect(await registry.owner()).to.equal(owner.address);
    expect(await registry.worldIdRouter()).to.equal(await mockWorldID.getAddress());
    expect(await registry.groupId()).to.equal(GROUP_ID);
  });

  it("rejects zero-address router", async function () {
    const Registry = await ethers.getContractFactory("OpenLaborAgentRegistry");
    await expect(
      Registry.deploy(ethers.ZeroAddress, GROUP_ID, ethers.id("test"))
    ).to.be.revertedWithCustomError(registry, "InvalidConfiguration");
  });

  it("registers agent and stores nullifier", async function () {
    await registry.connect(rando).register(agent.address, ROOT, 0, 999, PROOF);
    expect(await registry.lookupHuman(agent.address)).to.equal(999);
    expect(await registry.getNextNonce(agent.address)).to.equal(1);
  });

  it("rejects wrong nonce", async function () {
    await registry.connect(rando).register(agent.address, ROOT, 0, 999, PROOF);
    // nonce 0 again should fail
    await expect(
      registry.connect(rando).register(agent.address, ROOT, 0, 999, PROOF)
    ).to.be.revertedWithCustomError(registry, "InvalidNonce");
  });

  it("rejects unknown root", async function () {
    await expect(
      registry.connect(rando).register(agent.address, 11111, 0, 999, PROOF)
    ).to.be.revertedWithCustomError(registry, "InvalidRoot");
  });

  it("handles sequential registrations", async function () {
    await registry.connect(rando).register(agent.address, ROOT, 0, 1, PROOF);
    await registry.connect(rando).register(agent.address, ROOT, 1, 2, PROOF);
    await registry.connect(rando).register(agent.address, ROOT, 2, 3, PROOF);
    expect(await registry.getNextNonce(agent.address)).to.equal(3);
  });

  it("owner can update router and group", async function () {
    const Mock = await ethers.getContractFactory("MockOpenLaborWorldID");
    const newRouter = await Mock.deploy();
    await newRouter.waitForDeployment();

    await registry.setWorldIdRouter(await newRouter.getAddress());
    expect(await registry.worldIdRouter()).to.equal(await newRouter.getAddress());

    await registry.setGroupId(2);
    expect(await registry.groupId()).to.equal(2);
  });

  it("blocks non-owner from admin functions", async function () {
    await expect(registry.connect(rando).setGroupId(2)).to.be.revertedWith("Not owner");
    await expect(registry.connect(rando).addRoot(123)).to.be.revertedWith("Not owner");
  });

  it("two-step ownership transfer works", async function () {
    await registry.transferOwnership(rando.address);
    // old owner still in charge until acceptance
    expect(await registry.owner()).to.equal(owner.address);

    await expect(registry.connect(owner).acceptOwnership()).to.be.revertedWith("Not pending owner");

    await registry.connect(rando).acceptOwnership();
    expect(await registry.owner()).to.equal(rando.address);
  });
});
