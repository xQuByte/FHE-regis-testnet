"use client";

import { useEffect, useMemo, useState } from "react";
import { useFhevm } from "@fhevm-sdk";
import { AnimatePresence, motion } from "framer-motion";
import ClockLoader from "react-spinners/ClockLoader";
import { useAccount } from "wagmi";
import { RainbowKitCustomConnectButton } from "~~/components/helper/RainbowKitCustomConnectButton";
import { useFHERegisTestnetWagmi } from "~~/hooks/useFHERegisTestnetWagmi";

export const FHERegisTestnet = () => {
  const { isConnected, chain } = useAccount();
  const chainId = chain?.id;

  const provider = useMemo(() => (typeof window !== "undefined" ? (window as any).ethereum : undefined), []);
  const initialMockChains = {
    11155111: `https://eth-sepolia.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
  };

  const { instance: fhevmInstance } = useFhevm({
    provider,
    chainId,
    initialMockChains,
    enabled: true,
  });

  const regisTestnet = useFHERegisTestnetWagmi({ instance: fhevmInstance, initialMockChains });

  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decryptedEmail, setDecryptedEmail] = useState<string | null>(null);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Nếu trước đó đã submit rồi (isRegistered) thì set submitted = true
  useEffect(() => {
    if (regisTestnet.isRegistered) {
      setSubmitted(true);
    }
  }, [regisTestnet.isRegistered]);

  const handleSubmit = async () => {
    if (!emailRegex.test(email)) {
      setError("Please enter a valid email");
      return;
    }
    setError(null);

    try {
      const hexEmail = Buffer.from(email, "utf-8").toString("hex");
      const emailAsNumber = BigInt("0x" + hexEmail);

      await regisTestnet.registerEmail(emailAsNumber);
      setSubmitted(true);
    } catch (e: any) {
      setError(e?.message ?? "Submission failed");
    }
  };

  const handleDecrypt = () => {
    if (regisTestnet.canDecrypt) {
      regisTestnet.decryptMyEmail();
    }
  };

  // Watch for decryption result
  useEffect(() => {
    if (regisTestnet.isDecrypted && regisTestnet.clear) {
      let hex = regisTestnet.clear.toString(16);
      if (hex.length % 2) hex = "0" + hex;
      const emailStr = Buffer.from(hex, "hex").toString("utf-8");
      setDecryptedEmail(emailStr);
    }
  }, [regisTestnet.isDecrypted, regisTestnet.clear]);

  if (!isConnected) {
    return (
      <div className="min-h-[calc(100vh-60px)] w-full flex items-center justify-center">
        <div className="bg-gray-900/80 border border-gray-700 rounded-2xl p-10 text-center shadow-xl">
          <h2 className="text-3xl font-bold text-white mb-4">⚠️ Wallet not connected</h2>
          <p className="text-gray-300 mb-6">Connect your wallet to register for the testnet.</p>
          <RainbowKitCustomConnectButton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-60px)] w-full flex items-center justify-center p-6">
      {regisTestnet.isProcessing && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
          <ClockLoader color="#00ffd5" size={50} />
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-[500px] w-full bg-gray-900/70 backdrop-blur-md border border-gray-700 rounded-3xl p-8 shadow-2xl"
      >
        <div className="text-center mb-6">
          <h1 className="text-4xl font-extrabold text-white mb-2">📧 Testnet Registration</h1>
          <p className="text-gray-300">You can register your email for the testnet only once.</p>
        </div>

        {/* Email Form */}
        {!submitted && (
          <div className="space-y-4">
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-600 bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              onClick={handleSubmit}
              disabled={regisTestnet.isProcessing}
              className="w-full bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-3 rounded-xl shadow-md transition-transform duration-200 hover:scale-105 disabled:opacity-50"
            >
              {regisTestnet.isProcessing ? "⏳ Submitting..." : "Submit Email"}
            </button>
          </div>
        )}

        {/* After submit or already registered */}
        {submitted && (
          <div className="space-y-4 text-center">
            <p className="text-green-400 font-semibold">
              ✅ {regisTestnet.isRegistered ? "Email already registered!" : "Email submitted successfully!"}
            </p>
            <button
              onClick={handleDecrypt}
              disabled={!regisTestnet.canDecrypt}
              className="w-[390px] bg-green-500 hover:bg-green-600 text-white font-bold py-3 rounded-xl shadow-md transition-transform duration-200 hover:scale-105 disabled:opacity-50"
            >
              {regisTestnet.isDecrypted
                ? "🔓 Decrypted"
                : regisTestnet.isDecrypting
                  ? "⏳ Decrypting..."
                  : "🔓 Decrypt Email"}
            </button>

            {decryptedEmail && <p className="text-white font-mono mt-3">Decrypted Email: {decryptedEmail}</p>}
          </div>
        )}

        <AnimatePresence>
          {regisTestnet.message && (
            <motion.div
              className="mt-4 bg-gray-800/70 p-3 rounded-xl text-center text-white shadow-md"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
            >
              {regisTestnet.message}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
