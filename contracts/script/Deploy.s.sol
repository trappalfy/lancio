// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";

import {LancioLaunchpad} from "../src/LancioLaunchpad.sol";
import {LancioLocker} from "../src/LancioLocker.sol";
import {LancioHook} from "../src/LancioHook.sol";
import {ILancioLaunchpad} from "../src/interfaces/ILancioLaunchpad.sol";

/// @notice Deploys LancioHook (CREATE2, mined address), LancioLocker and LancioLaunchpad in three transactions.
/// Env: PROTOCOL_OWNER, PROTOCOL_TREASURY, optional POOL_MANAGER (defaults to Robinhood Chain mainnet v4).
/// Usage (mainnet ONLY with the owner's explicit go-ahead):
///   forge script script/Deploy.s.sol --rpc-url robinhood --broadcast --private-key $DEPLOYER_PRIVATE_KEY
contract Deploy is Script {
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    address constant ROBINHOOD_POOL_MANAGER = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    uint160 constant FLAG_MASK = (1 << 14) - 1;
    uint160 constant BEFORE_INITIALIZE = 1 << 13;

    function run() external {
        address owner = vm.envAddress("PROTOCOL_OWNER");
        address treasury = vm.envAddress("PROTOCOL_TREASURY");
        address poolManager = vm.envOr("POOL_MANAGER", ROBINHOOD_POOL_MANAGER);
        require(poolManager.code.length > 0, "PoolManager missing");
        require(CREATE2_DEPLOYER.code.length > 0, "CREATE2 deployer missing");

        vm.startBroadcast();
        address deployer = msg.sender;
        vm.stopBroadcast();

        uint64 nonce = vm.getNonce(deployer);
        // tx n: hook via CREATE2 deployer, tx n+1: locker, tx n+2: launchpad
        address lockerAddr = vm.computeCreateAddress(deployer, nonce + 1);
        address launchpadAddr = vm.computeCreateAddress(deployer, nonce + 2);

        bytes memory hookInit = abi.encodePacked(type(LancioHook).creationCode, abi.encode(poolManager, lockerAddr));
        (bytes32 salt, address hookAddr) = _mine(keccak256(hookInit));
        console.log("hook salt", uint256(salt));

        vm.startBroadcast();
        LancioHook hook = new LancioHook{salt: salt}(poolManager, lockerAddr);
        LancioLocker locker = new LancioLocker(IPoolManager(poolManager), ILancioLaunchpad(launchpadAddr), IHooks(address(hook)));
        LancioLaunchpad launchpad = new LancioLaunchpad(owner, treasury, address(locker));
        vm.stopBroadcast();

        require(address(hook) == hookAddr, "hook address");
        require(uint160(address(hook)) & FLAG_MASK == BEFORE_INITIALIZE, "hook flags");
        require(address(locker) == lockerAddr, "locker address");
        require(address(launchpad) == launchpadAddr, "launchpad address");
        require(hook.locker() == address(locker) && address(locker.launchpad()) == address(launchpad), "wiring");

        console.log("LancioHook     ", address(hook));
        console.log("LancioLocker   ", address(locker));
        console.log("LancioLaunchpad", address(launchpad));

        string memory json = "d";
        vm.serializeUint(json, "chainId", block.chainid);
        vm.serializeAddress(json, "hook", address(hook));
        vm.serializeAddress(json, "locker", address(locker));
        vm.serializeAddress(json, "launchpad", address(launchpad));
        vm.serializeAddress(json, "owner", owner);
        vm.serializeAddress(json, "treasury", treasury);
        string memory out = vm.serializeUint(json, "deployBlockL1", block.number);
        vm.writeJson(out, string.concat("deployments/", vm.envOr("DEPLOY_NAME", vm.toString(block.chainid)), ".json"));
    }

    function _mine(bytes32 initCodeHash) internal pure returns (bytes32 salt, address addr) {
        for (uint256 i; i < 1_000_000; ++i) {
            salt = bytes32(i);
            addr = address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), CREATE2_DEPLOYER, salt, initCodeHash)))));
            if (uint160(addr) & FLAG_MASK == BEFORE_INITIALIZE) return (salt, addr);
        }
        revert("no salt");
    }
}
