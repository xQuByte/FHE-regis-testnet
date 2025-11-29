"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDeployedContractInfo } from "./helper";
import { useWagmiEthers } from "./wagmi/useWagmiEthers";
import { FhevmInstance } from "@fhevm-sdk";
import {
  buildParamsFromAbi,
  getEncryptionMethod,
  useFHEDecrypt,
  useFHEEncryption,
  useInMemoryStorage,
} from "@fhevm-sdk";
import { ethers } from "ethers";
import { useReadContract } from "wagmi";
import type { Contract } from "~~/utils/helper/contract";
import type { AllowedChainIds } from "~~/utils/helper/networks";

export const useFHERegisTestnetWagmi = (parameters: {
  instance: FhevmInstance | undefined;
  initialMockChains?: Readonly<Record<number, string>>;
}) => {
  const { instance, initialMockChains } = parameters;
  const { storage: fhevmDecryptionSignatureStorage } = useInMemoryStorage();
  const { chainId, accounts, isConnected, ethersReadonlyProvider, ethersSigner } = useWagmiEthers(initialMockChains);

  const allowedChainId = typeof chainId === "number" ? (chainId as AllowedChainIds) : undefined;
  const { data: regisAirdrop } = useDeployedContractInfo({
    contractName: "FHERegisTestnet",
    chainId: allowedChainId,
  });

  type FHERegisTestnetInfo = Contract<"FHERegisTestnet"> & { chainId?: number };

  const [message, setMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const hasContract = Boolean(regisAirdrop?.address && regisAirdrop?.abi);
  const hasSigner = Boolean(ethersSigner);
  const hasProvider = Boolean(ethersReadonlyProvider);

  const getContract = (mode: "read" | "write") => {
    if (!hasContract) return undefined;
    const providerOrSigner = mode === "read" ? ethersReadonlyProvider : ethersSigner;
    if (!providerOrSigner) return undefined;
    return new ethers.Contract(regisAirdrop!.address, (regisAirdrop as FHERegisTestnetInfo).abi, providerOrSigner);
  };

  // Read encrypted email
  const {
    data: myEmailHandle,
    refetch: refreshMyEmailHandle,
    isFetching: isRefreshing,
  } = useReadContract({
    address: hasContract ? (regisAirdrop!.address as `0x${string}`) : undefined,
    abi: hasContract ? ((regisAirdrop as FHERegisTestnetInfo).abi as any) : undefined,
    functionName: "encryptedEmailOf" as const,
    args: [accounts ? accounts[0] : ""],
    query: {
      enabled: Boolean(hasContract && hasProvider),
      refetchOnWindowFocus: false,
    },
  });

  const emailHandle = useMemo(() => (myEmailHandle as string | undefined) ?? undefined, [myEmailHandle]);

  const isRegistered = useMemo(() => {
    if (!emailHandle) return false;
    if (emailHandle === ethers.ZeroHash || emailHandle === "0x" || emailHandle === "0x0") return false;
    return true;
  }, [emailHandle]);

  const requests = useMemo(() => {
    if (!hasContract || !emailHandle || emailHandle === ethers.ZeroHash) return undefined;
    return [{ handle: emailHandle, contractAddress: regisAirdrop!.address }] as const;
  }, [hasContract, regisAirdrop?.address, emailHandle]);

  const {
    canDecrypt,
    decrypt,
    isDecrypting,
    message: decMsg,
    results,
  } = useFHEDecrypt({
    instance,
    ethersSigner: ethersSigner as any,
    fhevmDecryptionSignatureStorage,
    chainId,
    requests,
  });

  useEffect(() => {
    if (decMsg) setMessage(decMsg);
  }, [decMsg]);

  const clearEmail = useMemo(() => {
    if (!emailHandle) return undefined;
    if (emailHandle === ethers.ZeroHash) return { handle: emailHandle, clear: BigInt(0) } as const;
    const clear = results[emailHandle];
    if (typeof clear === "undefined") return undefined;
    return { handle: emailHandle, clear } as const;
  }, [emailHandle, results]);

  const isDecrypted = useMemo(() => {
    if (!emailHandle) return false;
    const val = results?.[emailHandle];
    return typeof val !== "undefined" && BigInt(val) !== BigInt(0);
  }, [emailHandle, results]);

  const decryptMyEmail = decrypt;

  const { encryptWith } = useFHEEncryption({
    instance,
    ethersSigner: ethersSigner as any,
    contractAddress: regisAirdrop?.address,
  });

  const canRegister = useMemo(
    () => Boolean(hasContract && instance && hasSigner && !isProcessing),
    [hasContract, instance, hasSigner, isProcessing],
  );

  const getEncryptionMethodFor = (functionName: "registerEmail") => {
    const functionAbi = regisAirdrop?.abi.find(item => item.type === "function" && item.name === functionName);
    if (!functionAbi) {
      return { method: undefined as string | undefined, error: `Function ABI not found for ${functionName}` };
    }
    if (!functionAbi.inputs || functionAbi.inputs.length === 0) {
      return { method: undefined as string | undefined, error: `No inputs found for ${functionName}` };
    }
    const firstInput = functionAbi.inputs[0]!;
    return { method: getEncryptionMethod(firstInput.internalType), error: undefined };
  };

  const registerEmail = useCallback(
    async (emailAsNumber: bigint) => {
      if (isProcessing || !canRegister || emailAsNumber <= BigInt(0)) return;
      setIsProcessing(true);
      setMessage(`Encrypting and registering email...`);
      try {
        const { method, error } = getEncryptionMethodFor("registerEmail");
        if (!method) return setMessage(error ?? "Encryption method not found");
        const enc = await encryptWith(builder => {
          (builder as any)[method](emailAsNumber);
        });
        if (!enc) return setMessage("Encryption failed");
        const writeContract = getContract("write");
        if (!writeContract) return setMessage("Signer not available");
        const params = buildParamsFromAbi(enc, [...regisAirdrop!.abi] as any[], "registerEmail");
        const tx = await writeContract.registerEmail(...params, { gasLimit: 300_000 });
        setMessage("Waiting for confirmation...");
        await tx.wait();
        setMessage(`Email registration updated!`);
        await refreshMyEmailHandle();
      } catch (e) {
        setMessage(`registerEmail() failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setIsProcessing(false);
      }
    },
    [isProcessing, canRegister, encryptWith, getContract, refreshMyEmailHandle, regisAirdrop?.abi],
  );

  useEffect(() => {
    setMessage("");
  }, [accounts, chainId]);

  return {
    contractAddress: regisAirdrop?.address,
    canDecrypt,
    canRegister,
    decryptMyEmail,
    registerEmail,
    refreshMyEmailHandle,
    isDecrypted,
    message,
    clear: clearEmail?.clear,
    handle: emailHandle,
    isDecrypting,
    isRefreshing,
    isProcessing,
    isRegistered,
    chainId,
    accounts,
    isConnected,
    ethersSigner,
  };
};
