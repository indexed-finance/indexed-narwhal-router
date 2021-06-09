import { ethers } from 'hardhat';
import { expect } from "chai";
import { Greeter } from '../typechain/Greeter';


describe("Greeter", function() {
  let greeter: Greeter

  beforeEach('Deploy Greeter', async () => {
    const GreeterFactory = await ethers.getContractFactory("Greeter");
    greeter = (await GreeterFactory.deploy("Hello, world!")) as Greeter;
  })

  it("Should return the new greeting once it's changed", async () => {
    expect(await greeter.greet()).to.equal("Hello, world!");
    await greeter.setGreeting("Hola, mundo!");
    expect(await greeter.greet()).to.equal("Hola, mundo!");
  });
});