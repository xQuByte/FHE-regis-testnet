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

  // ===== Basic Tests =====
  it("should start with totalRegistered = 0", async function () {
    expect(await contract.getTotalRegistered()).to.eq(0);
  });

  it("should allow a user to register an encrypted email", async function () {
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

  it("should allow updating (re-registering) email without incrementing totalRegistered", async function () {
    const email1 = 1111n;
    const email2 = 2222n;

    // First time registration
    const enc1 = await fhevm.createEncryptedInput(contractAddress, signers.alice.address).add256(email1).encrypt();

    await (await contract.connect(signers.alice).registerEmail(enc1.handles[0], enc1.inputProof)).wait();

    // Second time update
    const enc2 = await fhevm.createEncryptedInput(contractAddress, signers.alice.address).add256(email2).encrypt();

    await (await contract.connect(signers.alice).registerEmail(enc2.handles[0], enc2.inputProof)).wait();

    expect(await contract.getTotalRegistered()).to.eq(1);

    const decrypted = await fhevm.userDecryptEuint(
      FhevmType.euint256,
      await contract.encryptedEmailOf(signers.alice.address),
      contractAddress,
      signers.alice,
    );

    expect(decrypted).to.eq(email2);
  });

  it("should allow multiple users to register independently", async function () {
    const aliceEmail = 5555n;
    const bobEmail = 9999n;

    const aliceEnc = await fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .add256(aliceEmail)
      .encrypt();
    const bobEnc = await fhevm.createEncryptedInput(contractAddress, signers.bob.address).add256(bobEmail).encrypt();

    await (await contract.connect(signers.alice).registerEmail(aliceEnc.handles[0], aliceEnc.inputProof)).wait();
    await (await contract.connect(signers.bob).registerEmail(bobEnc.handles[0], bobEnc.inputProof)).wait();

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

  it("should handle multiple registrations in sequence", async function () {
    const users = [signers.deployer, signers.alice, signers.bob];
    const emails = [123n, 456n, 789n];

    for (let i = 0; i < users.length; i++) {
      const enc = await fhevm.createEncryptedInput(contractAddress, users[i].address).add256(emails[i]).encrypt();

      await (await contract.connect(users[i]).registerEmail(enc.handles[0], enc.inputProof)).wait();
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

  it("should allow changing email multiple times", async function () {
    const step1 = 111n;
    const step2 = 222n;
    const step3 = 333n;

    const enc1 = await fhevm.createEncryptedInput(contractAddress, signers.alice.address).add256(step1).encrypt();
    await (await contract.connect(signers.alice).registerEmail(enc1.handles[0], enc1.inputProof)).wait();

    const enc2 = await fhevm.createEncryptedInput(contractAddress, signers.alice.address).add256(step2).encrypt();
    await (await contract.connect(signers.alice).registerEmail(enc2.handles[0], enc2.inputProof)).wait();

    const enc3 = await fhevm.createEncryptedInput(contractAddress, signers.alice.address).add256(step3).encrypt();
    await (await contract.connect(signers.alice).registerEmail(enc3.handles[0], enc3.inputProof)).wait();

    const finalDec = await fhevm.userDecryptEuint(
      FhevmType.euint256,
      await contract.encryptedEmailOf(signers.alice.address),
      contractAddress,
      signers.alice,
    );

    expect(finalDec).to.eq(step3);
    expect(await contract.getTotalRegistered()).to.eq(1);
  });
});
