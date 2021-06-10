import { ethers, waffle } from 'hardhat'
import { defaultAbiCoder } from '@ethersproject/abi'
import { keccak256 } from '@ethersproject/keccak256'
import { toUtf8Bytes } from '@ethersproject/strings'
import { BigNumber, Contract } from 'ethers'
import { getCreate2Address, solidityPack } from 'ethers/lib/utils'

export const MINIMUM_LIQUIDITY = BigNumber.from(10).pow(3)

const PERMIT_TYPEHASH = keccak256(
  toUtf8Bytes('Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)')
)

export function expandTo18Decimals(n: number): BigNumber {
  return BigNumber.from(n).mul(BigNumber.from(10).pow(18))
}

function getDomainSeparator(name: string, tokenAddress: string) {
  return keccak256(
    defaultAbiCoder.encode(
      ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
      [
        keccak256(toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),
        keccak256(toUtf8Bytes(name)),
        keccak256(toUtf8Bytes('1')),
        1,
        tokenAddress
      ]
    )
  )
}

export async function getApprovalDigest(
  token: Contract,
  approve: {
    owner: string
    spender: string
    value: BigNumber
  },
  nonce: BigNumber,
  deadline: BigNumber
): Promise<string> {
  const name = await token.name()
  const DOMAIN_SEPARATOR = getDomainSeparator(name, token.address)
  return keccak256(
    solidityPack(
      ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
      [
        '0x19',
        '0x01',
        DOMAIN_SEPARATOR,
        keccak256(
          defaultAbiCoder.encode(
            ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256'],
            [PERMIT_TYPEHASH, approve.owner, approve.spender, approve.value, nonce, deadline]
          )
        )
      ]
    )
  )
}

export async function mineBlock(timestamp: number): Promise<void> {
  await waffle.provider.send("evm_mine", [timestamp])
  // await new Promise(async (resolve, reject) => {
  //   ;(ethers.provider._web3Provider.sendAsync as any)(
  //     { jsonrpc: '2.0', method: 'evm_mine', params: [timestamp] },
  //     (error: any, result: any): void => {
  //       if (error) {
  //         reject(error)
  //       } else {
  //         resolve(result)
  //       }
  //     }
  //   )
  // })
}

const addressToBuffer = (address: string): Buffer => Buffer.from(address.slice(2).padStart(40, '0'), 'hex');

export function encodePrice(reserve0: BigNumber, reserve1: BigNumber) {
  return [reserve1.mul(BigNumber.from(2).pow(112)).div(reserve0), reserve0.mul(BigNumber.from(2).pow(112)).div(reserve1)]
}

export function sortTokens(tokenA: string, tokenB: string): string[] {
  return (tokenA.toLowerCase() < tokenB.toLowerCase()) ? [tokenA, tokenB] : [tokenB, tokenA];
}

export function computeUniswapPairAddress(factoryAddress: string, tokenA: string, tokenB: string): string {
  const initCodeHash = '0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f';
  const [token0, token1] = sortTokens(tokenA, tokenB);
  const salt = keccak256(
    Buffer.concat([addressToBuffer(token0), addressToBuffer(token1)])
  );
  return getCreate2Address(factoryAddress, salt, initCodeHash);
}

export function computeSushiswapPairAddress(factoryAddress: string, tokenA: string, tokenB: string): string {
  const initCodeHash = '0xe18a34eb0e04b04f7a0ac29a6e80748dca96319b42c54d679cb821dca90c6303';
  const [token0, token1] = sortTokens(tokenA, tokenB);
  const salt = keccak256(
    Buffer.concat([addressToBuffer(token0), addressToBuffer(token1)])
  );
  return getCreate2Address(factoryAddress, salt, initCodeHash);
}

export async function deployContract<C extends Contract>(name: string, ...args: any[]): Promise<C> {
  const f = await ethers.getContractFactory(name)
  const c = await f.deploy(...args)
  return c as C
}



export function swapOutGivenIn(amountIn: BigNumber, reserveIn: BigNumber, reserveOut: BigNumber) {
  const amountInWithFee = amountIn.mul(997);
  const numerator = amountInWithFee.mul(reserveOut);
  const denominator = reserveIn.mul(1000).add(amountInWithFee);
  return numerator.div(denominator);
}

export function swapInGivenOut(amountOut: BigNumber, reserveIn: BigNumber, reserveOut: BigNumber) {
  const numerator = reserveIn.mul(amountOut).mul(1000);
  const denominator = reserveOut.sub(amountOut).mul(997);
  return numerator.div(denominator).add(1);
}