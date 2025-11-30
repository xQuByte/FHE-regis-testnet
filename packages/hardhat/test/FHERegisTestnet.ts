import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { FHERegisTestnet, FHERegisTestnet__factory } from "../types";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("FHERegisTestnet")) as FHERegisTestnet__factory;
  const contract = (await factory.deploy()) as FHERegisTestnet;
  const contractAddress = await contract.getAddress();
  return { contract, contractAddress };
}

describe("FHERegisTestnet", function () {
  let signers: Signers;
  let contract: FHERegisTestnet;
  let contractAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = {
      deployer: ethSigners[0],
      alice: ethSigners[1],
      bob: ethSigners[2],
    };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`Tests require mock FHEVM environment`);
      this.skip();
    }
    ({ contract, contractAddress } = await deployFixture());
  });

  // ============================
  // ===== BASIC FUNCTIONALITY ==
  // ============================

  it("should start with totalRegistered = 0", async function () {
    expect(await contract.getTotalRegistered()).to.eq(0);
  });

  it("should allow a user to register an encrypted email once", async function () {
    const email1 = 123456789n;

    const encryptedEmail = await fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .add256(email1)
      .encrypt();

    await (
      await contract.connect(signers.alice).registerEmail(encryptedEmail.handles[0], encryptedEmail.inputProof)
    ).wait();

    expect(await contract.hasRegistered(signers.alice.address)).to.eq(true);
    expect(await contract.getTotalRegistered()).to.eq(1);

    const decrypted = await fhevm.userDecryptEuint(
      FhevmType.euint256,
      await contract.encryptedEmailOf(signers.alice.address),
      contractAddress,
      signers.alice,
    );
    expect(decrypted).to.eq(email1);
  });

  it("should revert when user tries to register again", async function () {
    const email1 = 1111n;
    const encrypted1 = await fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .add256(email1)
      .encrypt();

    // First time → OK
    await contract.connect(signers.alice).registerEmail(encrypted1.handles[0], encrypted1.inputProof);

    // Second attempt → Revert
    await expect(
      contract.connect(signers.alice).registerEmail(encrypted1.handles[0], encrypted1.inputProof),
    ).to.be.revertedWith("Already registered");
  });

  it("should allow multiple users to register independently", async function () {
    const aliceEmail = 5555n;
    const bobEmail = 9999n;

    const aliceEnc = await fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .add256(aliceEmail)
      .encrypt();

    const bobEnc = await fhevm.createEncryptedInput(contractAddress, signers.bob.address).add256(bobEmail).encrypt();

    await contract.connect(signers.alice).registerEmail(aliceEnc.handles[0], aliceEnc.inputProof);
    await contract.connect(signers.bob).registerEmail(bobEnc.handles[0], bobEnc.inputProof);

    expect(await contract.getTotalRegistered()).to.eq(2);

    const aliceDec = await fhevm.userDecryptEuint(
      FhevmType.euint256,
      await contract.encryptedEmailOf(signers.alice.address),
      contractAddress,
      signers.alice,
    );
    const bobDec = await fhevm.userDecryptEuint(
      FhevmType.euint256,
      await contract.encryptedEmailOf(signers.bob.address),
      contractAddress,
      signers.bob,
    );

    expect(aliceDec).to.eq(aliceEmail);
    expect(bobDec).to.eq(bobEmail);
  });

  it("should return zero for users who have not registered", async function () {
    const email = await contract.encryptedEmailOf(signers.bob.address);
    expect(email).to.eq(ethers.ZeroHash);
  });

  it("should correctly count registrations when multiple users register", async function () {
    const users = [signers.deployer, signers.alice, signers.bob];
    const emails = [111n, 222n, 333n];

    for (let i = 0; i < users.length; i++) {
      const enc = await fhevm.createEncryptedInput(contractAddress, users[i].address).add256(emails[i]).encrypt();

      await contract.connect(users[i]).registerEmail(enc.handles[0], enc.inputProof);
    }

    expect(await contract.getTotalRegistered()).to.eq(3);

    for (let i = 0; i < users.length; i++) {
      const dec = await fhevm.userDecryptEuint(
        FhevmType.euint256,
        await contract.encryptedEmailOf(users[i].address),
        contractAddress,
        users[i],
      );
      expect(dec).to.eq(emails[i]);
    }
  });
});
