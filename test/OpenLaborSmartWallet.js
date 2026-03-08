const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("OpenLaborSmartWallet", function () {
  let wallet, owner, factorySigner, bob;
  const ONE_HOUR = Math.floor(Date.now() / 1000) + 3600;

  beforeEach(async function () {
    [owner, factorySigner, bob] = await ethers.getSigners();
    const Wallet = await ethers.getContractFactory("OpenLaborSmartWallet");
    wallet = await Wallet.deploy(owner.address, factorySigner.address);
    await wallet.waitForDeployment();
  });

  it("stores owner and factory", async function () {
    expect(await wallet.owner()).to.equal(owner.address);
    expect(await wallet.factory()).to.equal(factorySigner.address);
  });

  it("rejects zero addresses in constructor", async function () {
    const Wallet = await ethers.getContractFactory("OpenLaborSmartWallet");
    await expect(Wallet.deploy(ethers.ZeroAddress, factorySigner.address)).to.be.revertedWith("Invalid owner");
    await expect(Wallet.deploy(owner.address, ethers.ZeroAddress)).to.be.revertedWith("Invalid factory");
  });

  it("owner and factory can add session keys", async function () {
    await wallet.connect(owner).addSessionKey(bob.address, ONE_HOUR);
    expect((await wallet.sessionKeys(bob.address)).active).to.be.true;
  });

  it("prevents owner address as session key", async function () {
    await expect(
      wallet.connect(owner).addSessionKey(owner.address, ONE_HOUR)
    ).to.be.revertedWith("Cannot set owner as session key");
  });

  it("caps session key expiration at 1 year", async function () {
    const tooFar = Math.floor(Date.now() / 1000) + 400 * 86400;
    await expect(
      wallet.connect(owner).addSessionKey(bob.address, tooFar)
    ).to.be.revertedWith("Expiration too far");
  });

  it("revoke clears session key", async function () {
    await wallet.connect(owner).addSessionKey(bob.address, ONE_HOUR);
    await wallet.connect(owner).revokeSessionKey(bob.address);
    expect((await wallet.sessionKeys(bob.address)).active).to.be.false;
  });

  it("validates owner EIP-1271 signature", async function () {
    const msg = "hello";
    const hash = ethers.hashMessage(msg);
    const sig = await owner.signMessage(msg);
    expect(await wallet.isValidSignature(hash, sig)).to.equal("0x1626ba7e");
  });

  it("rejects unknown signer", async function () {
    const msg = "hello";
    const hash = ethers.hashMessage(msg);
    const sig = await bob.signMessage(msg);
    expect(await wallet.isValidSignature(hash, sig)).to.equal("0xffffffff");
  });

  it("accepts ether", async function () {
    const addr = await wallet.getAddress();
    await owner.sendTransaction({ to: addr, value: ethers.parseEther("0.5") });
    expect(await ethers.provider.getBalance(addr)).to.equal(ethers.parseEther("0.5"));
  });
});
