import { createFixtureLoader } from '@ethereum-waffle/provider'
import { expect } from 'chai'
import { BigNumber, constants, ContractTransaction } from 'ethers'
import { ethers, waffle } from 'hardhat'
import { IIndexPool, IndexedNarwhalRouter, IUniswapV2Pair, IUniswapV2Factory, IERC20, IWETH, WETH9 } from '../typechain'
import { narwhalFixture } from './shared/fixtures'
import { expandTo18Decimals, swapInGivenOut, swapOutGivenIn } from './shared/utilities'

describe('IndexedNarwhalRouter', () => {
  const wallets = waffle.provider.getWallets()
  const [wallet] = wallets;
  const loadFixture = createFixtureLoader(wallets, waffle.provider)

  let weth: WETH9
  let token0: IERC20
  let token1: IERC20
  let pair_0_1_sushi: IUniswapV2Pair
  let pair_0_1_uni: IUniswapV2Pair
  let pair_0_weth_uni: IUniswapV2Pair
  let router: IndexedNarwhalRouter

  beforeEach(async () => {
    const fixture = await loadFixture(narwhalFixture)
    weth = fixture.weth
    token0 = fixture.token0
    token1 = fixture.token1
    pair_0_1_sushi = fixture.pair_0_1_sushi
    pair_0_1_uni = fixture.pair_0_1_uni
    pair_0_weth_uni = fixture.pair_0_weth_uni
    router = fixture.router
  })

  function encodePathToken(token: string, sushi: boolean) {
    return [
      '0x',
      token.slice(2).padStart(62, '0'),
      sushi ? '01' : '00'
    ].join('');
  }

  async function addLiquidity(
    token0Amount: BigNumber = expandTo18Decimals(1000),
    token1Amount: BigNumber = expandTo18Decimals(1000),
    wethAmount: BigNumber = expandTo18Decimals(1000)
  ) {
    await token0.transfer(pair_0_1_sushi.address, token0Amount)
    await token0.transfer(pair_0_1_uni.address, token0Amount)
    await token0.transfer(pair_0_weth_uni.address, token0Amount)
    await token1.transfer(pair_0_1_sushi.address, token1Amount)
    await token1.transfer(pair_0_1_uni.address, token1Amount)
    await weth.deposit({ value: wethAmount })
    await weth.transfer(pair_0_weth_uni.address, wethAmount)
    await pair_0_1_sushi.mint(wallet.address)
    await pair_0_1_uni.mint(wallet.address)
    await pair_0_weth_uni.mint(wallet.address)
  }

  describe('swapExactTokensForTokens', () => {
    const token0Amount = expandTo18Decimals(5)
    const token1Amount = expandTo18Decimals(10)
    const wethAmount = expandTo18Decimals(15)
    const swapAmount = expandTo18Decimals(1)
    const output0 = swapOutGivenIn(swapAmount, token1Amount, token0Amount)
    const output1 = swapOutGivenIn(output0, token0Amount, wethAmount)

    beforeEach(async () => {
      await addLiquidity(token0Amount, token1Amount, wethAmount)
      await token1.approve(router.address, constants.MaxUint256)
    })

    it('sushi -> uni', async () => {
      await expect(
        router.swapExactTokensForTokens(
          swapAmount,
          0,
          [
            encodePathToken(token1.address, true),
            encodePathToken(token0.address, false),
            encodePathToken(weth.address, false)
          ],
          wallet.address,
          constants.MaxUint256
        )
      )
        .to.emit(token1, 'Transfer')
        .withArgs(wallet.address, pair_0_1_sushi.address, swapAmount)
        .to.emit(token0, 'Transfer')
        .withArgs(pair_0_1_sushi.address, pair_0_weth_uni.address, output0)
        .to.emit(weth, 'Transfer')
        .withArgs(pair_0_weth_uni.address, wallet.address, output1)
    })

    it('sushi', async () => {
      await expect(
        router.swapExactTokensForTokens(
          swapAmount,
          0,
          [
            encodePathToken(token1.address, true),
            encodePathToken(token0.address, false),
          ],
          wallet.address,
          constants.MaxUint256
        )
      )
        .to.emit(token1, 'Transfer')
        .withArgs(wallet.address, pair_0_1_sushi.address, swapAmount)
        .to.emit(token0, 'Transfer')
        .withArgs(pair_0_1_sushi.address, wallet.address, output0)
    })

    it('uni', async () => {
      await expect(
        router.swapExactTokensForTokens(
          swapAmount,
          0,
          [
            encodePathToken(token1.address, false),
            encodePathToken(token0.address, false),
          ],
          wallet.address,
          constants.MaxUint256
        )
      )
        .to.emit(token1, 'Transfer')
        .withArgs(wallet.address, pair_0_1_uni.address, swapAmount)
        .to.emit(token0, 'Transfer')
        .withArgs(pair_0_1_uni.address, wallet.address, output0)
    })
  })

  describe('swapTokensForExactTokens', () => {
    const token0Amount = expandTo18Decimals(5)
    const token1Amount = expandTo18Decimals(10)
    const wethAmount = expandTo18Decimals(15)
    const swapAmount = expandTo18Decimals(1)
    const input1 = swapInGivenOut(swapAmount, token0Amount, wethAmount)
    const input0 = swapInGivenOut(input1, token1Amount, token0Amount)

    beforeEach(async () => {
      await addLiquidity(token0Amount, token1Amount, wethAmount)
      await token1.approve(router.address, constants.MaxUint256)
    })

    it('sushi -> uni', async () => {
      await expect(
        router.swapTokensForExactTokens(
          swapAmount,
          input0,
          [
            encodePathToken(token1.address, true),
            encodePathToken(token0.address, false),
            encodePathToken(weth.address, false)
          ],
          wallet.address,
          constants.MaxUint256
        )
      )
        .to.emit(token1, 'Transfer')
        .withArgs(wallet.address, pair_0_1_sushi.address, input0)
        .to.emit(token0, 'Transfer')
        .withArgs(pair_0_1_sushi.address, pair_0_weth_uni.address, input1)
        .to.emit(weth, 'Transfer')
        .withArgs(pair_0_weth_uni.address, wallet.address, swapAmount)
    })

    it('sushi', async () => {
      await expect(
        router.swapTokensForExactTokens(
          input1,
          input0,
          [
            encodePathToken(token1.address, true),
            encodePathToken(token0.address, false),
          ],
          wallet.address,
          constants.MaxUint256
        )
      )
        .to.emit(token1, 'Transfer')
        .withArgs(wallet.address, pair_0_1_sushi.address, input0)
        .to.emit(token0, 'Transfer')
        .withArgs(pair_0_1_sushi.address, wallet.address, input1)
    })

    it('uni', async () => {
      await expect(
        router.swapTokensForExactTokens(
          input1,
          input0,
          [
            encodePathToken(token1.address, false),
            encodePathToken(token0.address, false),
          ],
          wallet.address,
          constants.MaxUint256
        )
      )
        .to.emit(token1, 'Transfer')
        .withArgs(wallet.address, pair_0_1_uni.address, input0)
        .to.emit(token0, 'Transfer')
        .withArgs(pair_0_1_uni.address, wallet.address, input1)
    })
  })

  describe('swapExactETHForTokens', () => {
    const token0Amount = expandTo18Decimals(5)
    const token1Amount = expandTo18Decimals(10)
    const wethAmount = expandTo18Decimals(15)
    const swapAmount = expandTo18Decimals(1)
    const output0 = swapOutGivenIn(swapAmount, wethAmount, token0Amount)
    const output1 = swapOutGivenIn(output0, token0Amount, token1Amount)

    beforeEach(async () => {
      await addLiquidity(token0Amount, token1Amount, wethAmount)
      await token1.approve(router.address, constants.MaxUint256)
    })

    it('uni -> sushi', async () => {
      await expect(
        router.swapExactETHForTokens(
          0,
          [
            encodePathToken(weth.address, false),
            encodePathToken(token0.address, true),
            encodePathToken(token1.address, false),
          ],
          wallet.address,
          constants.MaxUint256,
          { value: swapAmount }
        )
      )
        .to.emit(weth, 'Deposit')
        .withArgs(router.address, swapAmount)
        .to.emit(weth, 'Transfer')
        .withArgs(router.address, pair_0_weth_uni.address, swapAmount)
        .to.emit(token0, 'Transfer')
        .withArgs(pair_0_weth_uni.address, pair_0_1_sushi.address, output0)
        .to.emit(token1, 'Transfer')
        .withArgs(pair_0_1_sushi.address, wallet.address, output1)
    })

    it('uni', async () => {
      await expect(
        router.swapExactETHForTokens(
          0,
          [
            encodePathToken(weth.address, false),
            encodePathToken(token0.address, false),
            encodePathToken(token1.address, false),
          ],
          wallet.address,
          constants.MaxUint256,
          { value: swapAmount }
        )
      )
      .to.emit(weth, 'Deposit')
      .withArgs(router.address, swapAmount)
      .to.emit(weth, 'Transfer')
      .withArgs(router.address, pair_0_weth_uni.address, swapAmount)
      .to.emit(token0, 'Transfer')
      .withArgs(pair_0_weth_uni.address, pair_0_1_uni.address, output0)
      .to.emit(token1, 'Transfer')
      .withArgs(pair_0_1_uni.address, wallet.address, output1)
    })
  })

  describe('swapExactTokensForETH', () => {
    const token0Amount = expandTo18Decimals(5)
    const token1Amount = expandTo18Decimals(10)
    const wethAmount = expandTo18Decimals(15)
    const swapAmount = expandTo18Decimals(1)
    const output0 = swapOutGivenIn(swapAmount, token1Amount, token0Amount)
    const output1 = swapOutGivenIn(output0, token0Amount, wethAmount)

    beforeEach(async () => {
      await addLiquidity(token0Amount, token1Amount, wethAmount)
      await token1.approve(router.address, constants.MaxUint256)
    })

    it('sushi -> uni', async () => {
      await expect(
        router.swapExactTokensForETH(
          swapAmount,
          0,
          [
            encodePathToken(token1.address, true),
            encodePathToken(token0.address, false),
            encodePathToken(weth.address, false)
          ],
          wallet.address,
          constants.MaxUint256
        )
      )
        .to.emit(token1, 'Transfer')
        .withArgs(wallet.address, pair_0_1_sushi.address, swapAmount)
        .to.emit(token0, 'Transfer')
        .withArgs(pair_0_1_sushi.address, pair_0_weth_uni.address, output0)
        .to.emit(weth, 'Transfer')
        .withArgs(pair_0_weth_uni.address, router.address, output1)
        .to.emit(weth, 'Withdrawal')
        .withArgs(router.address, output1)
    })
  })

  describe('swapTokensForExactETH', () => {
    const token0Amount = expandTo18Decimals(5)
    const token1Amount = expandTo18Decimals(10)
    const wethAmount = expandTo18Decimals(15)
    const swapAmount = expandTo18Decimals(1)
    const input1 = swapInGivenOut(swapAmount, token0Amount, wethAmount)
    const input0 = swapInGivenOut(input1, token1Amount, token0Amount)

    beforeEach(async () => {
      await addLiquidity(token0Amount, token1Amount, wethAmount)
      await token1.approve(router.address, constants.MaxUint256)
    })

    it('sushi -> uni', async () => {
      await expect(
        router.swapTokensForExactETH(
          swapAmount,
          input0,
          [
            encodePathToken(token1.address, true),
            encodePathToken(token0.address, false),
            encodePathToken(weth.address, false)
          ],
          wallet.address,
          constants.MaxUint256
        )
      )
        .to.emit(token1, 'Transfer')
        .withArgs(wallet.address, pair_0_1_sushi.address, input0)
        .to.emit(token0, 'Transfer')
        .withArgs(pair_0_1_sushi.address, pair_0_weth_uni.address, input1)
        .to.emit(weth, 'Transfer')
        .withArgs(pair_0_weth_uni.address, router.address, swapAmount)
        .to.emit(weth, 'Withdrawal')
        .withArgs(router.address, swapAmount)
    })
  })

  describe('swapETHForExactTokens', () => {
    const token0Amount = expandTo18Decimals(5)
    const token1Amount = expandTo18Decimals(10)
    const wethAmount = expandTo18Decimals(15)
    const swapAmount = expandTo18Decimals(1)
    const input1 = swapInGivenOut(swapAmount, token0Amount, token1Amount)
    const input0 = swapInGivenOut(input1, wethAmount, token0Amount)

    beforeEach(async () => {
      await addLiquidity(token0Amount, token1Amount, wethAmount)
    })

    it('sushi -> uni', async () => {
      await expect(
        router.swapETHForExactTokens(
          swapAmount,
          [
            encodePathToken(weth.address, false),
            encodePathToken(token0.address, true),
            encodePathToken(token1.address, false),
          ],
          wallet.address,
          constants.MaxUint256,
          { value: input0 }
        )
      )
        .to.emit(weth, 'Deposit')
        .withArgs(router.address, input0)
        .to.emit(weth, 'Transfer')
        .withArgs(router.address, pair_0_weth_uni.address, input0)
        .to.emit(token0, 'Transfer')
        .withArgs(pair_0_weth_uni.address, pair_0_1_sushi.address, input1)
        .to.emit(token1, 'Transfer')
        .withArgs(pair_0_1_sushi.address, wallet.address, swapAmount)
    })
  })
})