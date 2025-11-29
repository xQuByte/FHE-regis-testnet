import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedFHERegisTestnet = await deploy("FHERegisTestnet", {
    from: deployer,
    log: true,
  });

  console.log(`FHERegisTestnet contract: `, deployedFHERegisTestnet.address);
};
export default func;
func.id = "deploy_FHERegisTestnet"; // id required to prevent reexecution
func.tags = ["FHERegisTestnet"];
