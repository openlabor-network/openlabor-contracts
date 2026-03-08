const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("OpenLaborWalletFactory", function () {
  let factory, admin, alice, bob;

  beforeEach(async function () {
    [admin, alice, bob] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("OpenLaborWalletFactory");
    factory = await Factory.deploy();
    await factory.waitForDeployment();
  });

  it("sets deployer as admin", async function () {
    expect(await factory.admin()).to.equal(admin.address);
  });

  it("creates wallets and tracks them per owner", async function () {
    await factory.connect(alice).createWallet();
    await factory.connect(alice).createWallet();
    await factory.connect(bob).createWallet();

    expect(await factory.getWalletCount(alice.address)).to.equal(2);
    expect(await factory.getWalletCount(bob.address)).to.equal(1);

    const aliceWallets = await factory.getWallets(alice.address);
    expect(aliceWallets.length).to.equal(2);
    expect(aliceWallets[0]).to.not.equal(aliceWallets[1]);
  });

  it("emits WalletCreated with correct args", async function () {
    await expect(factory.connect(alice).createWallet()).to.emit(factory, "WalletCreated");
  });

  it("reverts on out-of-bounds index", async function () {
    await expect(factory.getWallet(alice.address, 0)).to.be.revertedWith("Index out of bounds");
  });

  describe("session keys via factory", function () {
    let walletAddr;

    beforeEach(async function () {
      const tx = await factory.connect(alice).createWallet();
      const receipt = await tx.wait();
      walletAddr = receipt.logs.find(l => l.fragment?.name === "WalletCreated").args.wallet;
    });

    it("admin can set session key", async function () {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      await expect(factory.connect(admin).setSessionKey(walletAddr, bob.address, exp)).to.not.be.reverted;
    });

    it("wallet owner can set session key", async function () {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      await expect(factory.connect(alice).setSessionKey(walletAddr, bob.address, exp)).to.not.be.reverted;
    });

    it("random caller gets rejected", async function () {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      await expect(factory.connect(bob).setSessionKey(walletAddr, bob.address, exp)).to.be.revertedWith("Not authorized");
    });

    it("rejects wallets from a different factory", async function () {
      const F2 = await ethers.getContractFactory("OpenLaborWalletFactory");
      const other = await F2.deploy();
      await other.waitForDeployment();

      const W = await ethers.getContractFactory("OpenLaborSmartWallet");
      const w = await W.deploy(alice.address, await other.getAddress());
      await w.waitForDeployment();

      const exp = Math.floor(Date.now() / 1000) + 3600;
      await expect(
        factory.connect(admin).setSessionKey(await w.getAddress(), bob.address, exp)
      ).to.be.revertedWith("Wallet not from this factory");
    });
  });

  describe("admin transfer", function () {
    it("two-step transfer works", async function () {
      await factory.connect(admin).transferAdmin(bob.address);
      expect(await factory.admin()).to.equal(admin.address); // not yet

      await factory.connect(bob).acceptAdmin();
      expect(await factory.admin()).to.equal(bob.address);
    });

    it("non-admin cant initiate", async function () {
      await expect(factory.connect(alice).transferAdmin(bob.address)).to.be.revertedWith("Not admin");
    });

    it("wrong address cant accept", async function () {
      await factory.connect(admin).transferAdmin(bob.address);
      await expect(factory.connect(alice).acceptAdmin()).to.be.revertedWith("Not pending admin");
    });
  });
});
