/**
 * Starts a local anvil chain with the deployment's chain id, deploys the real LaunchToken and
 * TicTacToeWager bytecode compiled by Foundry from this repository, funds two players, and hands
 * the addresses to the tests. Anvil is stopped when the run ends. Requires `anvil` and `forge`.
 */
import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { createPublicClient, createWalletClient, defineChain, http, parseEther, type Abi, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import type { TestProject } from 'vitest/node'

export interface AnvilInfo {
  rpcUrl: string
  chainId: number
  token: Address
  game: Address
  /** [deployer holding the supply, player 1, player 2]; all unlocked in anvil. */
  accounts: Address[]
}

declare module 'vitest' {
  export interface ProvidedContext {
    anvil: AnvilInfo
  }
}

const repoDir = resolve(import.meta.dirname, '..', '..')
const DEPLOYER_KEY: Hex = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const ACCOUNTS: Address[] = [
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
]

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => (port ? done(port) : fail(new Error('no port'))))
    })
  })
}

function artifact(name: string): { abi: Abi; bytecode: Hex } {
  const path = resolve(repoDir, 'out', `${name}.sol`, `${name}.json`)
  if (!existsSync(path)) execSync('forge build', { cwd: repoDir, stdio: 'inherit' })
  const json = JSON.parse(readFileSync(path, 'utf8')) as { abi: Abi; bytecode: { object: Hex } }
  return { abi: json.abi, bytecode: json.bytecode.object }
}

async function waitForRpc(url: string, tries = 100): Promise<void> {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' })
      if (res.ok) return
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`anvil did not answer at ${url}`)
}

export default async function setup(project: TestProject): Promise<() => void> {
  const handoff = JSON.parse(readFileSync(resolve(repoDir, 'web', 'deployment', 'handoff.json'), 'utf8')) as { chainId: number }
  const chainId = handoff.chainId
  const port = await freePort()
  const rpcUrl = `http://127.0.0.1:${port}`
  const anvil: ChildProcess = spawn('anvil', ['--port', String(port), '--chain-id', String(chainId), '--silent'], { stdio: 'ignore' })
  await waitForRpc(rpcUrl)

  const chain = defineChain({ id: chainId, name: 'anvil', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } })
  const account = privateKeyToAccount(DEPLOYER_KEY)
  const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) })
  const client = createPublicClient({ chain, transport: http(rpcUrl) })

  const deploy = async (name: string, args: unknown[] = []): Promise<Address> => {
    const { abi, bytecode } = artifact(name)
    const hash = await wallet.deployContract({ abi, bytecode, args })
    const receipt = await client.waitForTransactionReceipt({ hash })
    if (!receipt.contractAddress) throw new Error(`${name} deployment produced no address`)
    return receipt.contractAddress
  }
  const token = await deploy('LaunchToken')
  const game = await deploy('TicTacToeWager', [token])
  const tokenAbi = artifact('LaunchToken').abi
  for (const player of ACCOUNTS.slice(1)) {
    const hash = await wallet.writeContract({ address: token, abi: tokenAbi, functionName: 'transfer', args: [player, parseEther('1000')] })
    await client.waitForTransactionReceipt({ hash })
  }

  project.provide('anvil', { rpcUrl, chainId, token, game, accounts: ACCOUNTS })
  return () => {
    anvil.kill('SIGTERM')
  }
}
