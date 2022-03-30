import * as core from '@actions/core'
import {Octokit} from '@octokit/core'
import fs from 'fs'
import path from 'path'
const sodium = require('tweetsodium')

interface SecretData {
  [key: string]: string
}

const dispatchOrgSecret = async (
  octokit: Octokit,
  org: string,
  secretData: SecretData
): Promise<void> => {
  const key: string = (
    await octokit.request(`GET /orgs/${org}/actions/secrets/public-key`)
  ).data.key
  const promises = []
  for (const [secret_name, value] of Object.entries(secretData)) {
    const encrypted_value = Buffer.from(
      sodium.seal(Buffer.from(value), Buffer.from(key, 'base64'))
    ).toString('base64')
    promises.push(
      octokit.request(`PUT /orgs/${org}/actions/secrets/${secret_name}`, {
        org,
        secret_name,
        encrypted_value
      })
    )
  }
  await Promise.all(promises)
  console.log(`${org} secret dispatched`)
}

const dispatchRepoSecret = async (
  octokit: Octokit,
  target: string,
  secretData: SecretData
): Promise<void> => {
  const [owner, repo] = target.split('/')
  const key: string = (
    await octokit.request(
      `GET /repos/${owner}/${repo}/actions/secrets/public-key`
    )
  ).data.key
  const promises = []
  for (const [secret_name, value] of Object.entries(secretData)) {
    const encrypted_value = Buffer.from(
      sodium.seal(Buffer.from(value), Buffer.from(key, 'base64'))
    ).toString('base64')
    promises.push(
      await octokit.request(
        `PUT /repos/${owner}/${repo}/actions/secrets/${secret_name}`,
        {
          owner,
          repo,
          secret_name,
          encrypted_value
        }
      )
    )
  }
  await Promise.all(promises)
  console.log(`${target} secret dispatched`)
}

async function run(): Promise<void> {
  try {
    const token: string = core.getInput('token')
    const secretData: SecretData = JSON.parse(
      fs.readFileSync(
        path.join(
          process.env.GITHUB_WORKSPACE as string,
          core.getInput('json-path')
        ),
        'utf8'
      )
    )
    const octokit = new Octokit({auth: token})
    const targets = core.getInput('targets').split(',')
    for (const item of targets) {
      const target = item.trim()
      if (target.includes('/')) {
        dispatchOrgSecret(octokit, target, secretData)
      } else {
        dispatchRepoSecret(octokit, target, secretData)
      }
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
