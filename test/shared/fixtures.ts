import { ethers, waffle } from 'hardhat'

import { IIndexPool, IndexedNarwhalRouter, IUniswapV2Pair, IUniswapV2Factory, IERC20, IWETH, WETH9 } from '../../typechain'

import UniswapV2Factory from '../../imports/UniswapV2Factory.json'
import SushiswapV2Factory from '../../imports/SushiswapV2Factory.json'
import IndexPool from '../../imports/SigmaIndexPoolV1.json'
import { deployContract, expandTo18Decimals } from './utilities'
import { BigNumber, constants } from 'ethers'
import { bnum, BONE, calcAllInGivenPoolOut, calcAllOutGivenPoolIn, calcPoolInGivenSingleOut, calcPoolOutGivenSingleIn, calcSingleInGivenPoolOut, calcSingleOutGivenPoolIn, toTokenAmount } from './bnum';

export interface RouterFixture {
  weth: WETH9
  token0: IERC20
  token1: IERC20
  uniswapFactory: IUniswapV2Factory
  sushiswapFactory: IUniswapV2Factory
  pair_0_1_sushi: IUniswapV2Pair
  pair_0_1_uni: IUniswapV2Pair
  pair_0_weth_uni: IUniswapV2Pair
  indexPool: IIndexPool
  router: IndexedNarwhalRouter
  poolOutGivenTokenIn: (n: BigNumber) => BigNumber
  tokenInGivenPoolOut: (n: BigNumber) => BigNumber
  tokenOutGivenPoolIn: (n: BigNumber) => BigNumber
  poolInGivenTokenOut: (n: BigNumber) => BigNumber
  allInGivenPoolOut: (n: BigNumber) => BigNumber[]
  allOutGivenPoolIn: (n: BigNumber) => BigNumber[]
}

export async function narwhalFixture(): Promise<RouterFixture> {
  // deploy tokens
  const tokenA: IERC20 = await deployContract('ERC20', expandTo18Decimals(10000))
  const tokenB: IERC20 = await deployContract('ERC20', expandTo18Decimals(10000))
  let [token0, token1] = (tokenA.address.toLowerCase() < tokenB.address.toLowerCase())
    ? [tokenA, tokenB]
    : [tokenB, tokenA]
  const weth: WETH9 = await deployContract('WETH9')
  const [signer] = waffle.provider.getWallets()
  const uniswapFactory = await waffle.deployContract(signer, UniswapV2Factory, [signer.address]) as IUniswapV2Factory
  const sushiswapFactory = await waffle.deployContract(signer, SushiswapV2Factory, [signer.address]) as IUniswapV2Factory
  await sushiswapFactory.createPair(token0.address, token1.address)
  await uniswapFactory.createPair(token0.address, token1.address)
  await uniswapFactory.createPair(token0.address, weth.address)
  const pair_0_1_sushi = await ethers.getContractAt('IUniswapV2Pair', await sushiswapFactory.getPair(token0.address, token1.address)) as IUniswapV2Pair
  const pair_0_1_uni = await ethers.getContractAt('IUniswapV2Pair', await uniswapFactory.getPair(token0.address, token1.address)) as IUniswapV2Pair
  const pair_0_weth_uni = await ethers.getContractAt(
    'IUniswapV2Pair',
      token0.address.toLowerCase() < weth.address.toLowerCase()
        ? await uniswapFactory.getPair(token0.address, weth.address)
        : await uniswapFactory.getPair(weth.address, token0.address)
  ) as IUniswapV2Pair
  const indexPool = await waffle.deployContract(signer, IndexPool, []) as IIndexPool
  await indexPool.configure(signer.address, 'Pool', 'Pool')
  await tokenA.approve(indexPool.address, expandTo18Decimals(1000))
  await tokenB.approve(indexPool.address, expandTo18Decimals(1000))
  await indexPool.initialize(
    [token0.address, token1.address],
    [expandTo18Decimals(1000), expandTo18Decimals(1000)],
    [expandTo18Decimals(10), expandTo18Decimals(10)],
    signer.address,
    constants.AddressZero,
    signer.address
  )
  const router = await deployContract('IndexedNarwhalRouter', uniswapFactory.address, sushiswapFactory.address, weth.address) as IndexedNarwhalRouter
  function poolOutGivenTokenIn(amountIn: BigNumber) {
    return BigNumber.from(
      calcPoolOutGivenSingleIn(
        toTokenAmount(1000, 18),
        toTokenAmount(10, 18),
        toTokenAmount(100, 18),
        toTokenAmount(20, 18),
        bnum(amountIn),
        toTokenAmount(0.025, 18)
      ).toString(10)
    );
  }
  function tokenInGivenPoolOut(poolOut: BigNumber) {
    return BigNumber.from(
      calcSingleInGivenPoolOut(
        toTokenAmount(1000, 18),
        toTokenAmount(10, 18),
        toTokenAmount(100, 18),
        toTokenAmount(20, 18),
        bnum(poolOut),
        BONE.div(40),
      ).toString(10)
    );
  }
  function tokenOutGivenPoolIn(poolIn: BigNumber) {
    return BigNumber.from(
      calcSingleOutGivenPoolIn(
        toTokenAmount(1000, 18),
        toTokenAmount(10, 18),
        toTokenAmount(100, 18),
        toTokenAmount(20, 18),
        bnum(poolIn),
        BONE.div(40),
        BONE.div(200)
      ).toString(10)
    );
  }
  function poolInGivenTokenOut(amountOut: BigNumber) {
    return BigNumber.from(
      calcPoolInGivenSingleOut(
        toTokenAmount(1000, 18),
        toTokenAmount(10, 18),
        toTokenAmount(100, 18),
        toTokenAmount(20, 18),
        bnum(amountOut),
        BONE.div(40),
        BONE.div(200)
      ).toString(10)
    );
  }
  function allInGivenPoolOut(poolOut: BigNumber) {
    return calcAllInGivenPoolOut(
      [toTokenAmount(1000, 18), toTokenAmount(1000, 18)],
      toTokenAmount(100, 18),
      bnum(poolOut)
    ).map(n => BigNumber.from(n.toString(10)))
  }
  function allOutGivenPoolIn(poolIn: BigNumber) {
    return calcAllOutGivenPoolIn(
      [toTokenAmount(1000, 18), toTokenAmount(1000, 18)],
      toTokenAmount(100, 18),
      bnum(poolIn),
      BONE.div(200)
    ).map(n => BigNumber.from(n.toString(10)))
  }

  return {
    token0,
    token1,
    weth,
    uniswapFactory,
    sushiswapFactory,
    pair_0_1_sushi,
    pair_0_1_uni,
    pair_0_weth_uni,
    indexPool,
    router,
    poolOutGivenTokenIn,
    tokenInGivenPoolOut,
    tokenOutGivenPoolIn,
    poolInGivenTokenOut,
    allInGivenPoolOut,
    allOutGivenPoolIn
  }
}