import Avatar from '../avatar'
import { named } from '../lib/logger'
import { cloneDeep } from 'lodash'
import { AuthFeatureResultSuccess } from '../auth-parcel'

const log = named('send-slack-log')

const SLACK_HOOK = process.env.SLACK_HOOK

export async function sendNerfLogToSlack(authFeatureResult: AuthFeatureResultSuccess, wallet: string) {
  const { feature, parcel, moderator } = authFeatureResult
  const nerferParcel = authFeatureResult.currentParcel

  if (!parcel) {
    log.error('parcel not found')
    return
  }
  if (!feature) {
    log.error('feature not found')
    return
  }

  const nerferName = await Avatar.getNameByWalletOrDefault(wallet)
  const parcelOwnerName = await Avatar.getNameByWalletOrDefault(parcel.owner)

  if (!SLACK_HOOK) {
    throw new Error('SLACK_HOOK env variable must be specified to use bug report.')
  }

  const body = cloneDeep(TEMPLATE)

  if (body.blocks[0].text) {
    if (moderator) {
      body.blocks[0].text.text = `Moderator <https://www.voxels.com/avatar/${wallet}|${nerferName}> deleted a feature \n`
    } else {
      body.blocks[0].text.text = 'A user deleted an out-of-bounds feature \n'
    }
  }

  if (body.blocks[1].fields) {
    body.blocks[1].fields[0].text = `*Parcel:*\n <https://www.voxels.com/parcels/${parcel.id}|Parcel #${parcel.id}>`
    body.blocks[1].fields[1].text = `*Type:*\n ${feature.type}`
    body.blocks[1].fields[2].text = `*Feature UUID:*\n ${feature.uuid}`
    body.blocks[1].fields[3].text = `*Parcel owner:*\n <https://www.voxels.com/avatar/${parcel.owner}|${parcelOwnerName}>`
  }
  if (moderator) {
    body.blocks.length = 2
  } else if (body.blocks[3].fields) {
    if (nerferParcel) {
      body.blocks[3].fields[0].text = `*Violated parcel:*\n <https://www.voxels.com/parcels/${nerferParcel.id}|Parcel #${nerferParcel.id}>`
    }
    body.blocks[3].fields[1].text = `*Nerfed By:*\n <https://www.voxels.com/avatar/${wallet}|${nerferName}>`
  }

  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    authorization: SLACK_HOOK,
  }

  // SOLANA/security: the upstream repo hardcoded a live Slack Incoming Webhook
  // URL here (a secret). It has been removed — configure SLACK_LOG_WEBHOOK_URL
  // in the environment instead. If unset, slack logging is skipped.
  const slackWebhook = process.env.SLACK_LOG_WEBHOOK_URL
  if (!slackWebhook) {
    return 'slack webhook not configured'
  }

  let result: Response | undefined
  try {
    result = await fetch(slackWebhook, {
      headers,
      method: 'POST',
      body: JSON.stringify(body),
    })
  } catch (e) {
    log.error('posting to slack failed', e)
  }
  return result ? await result.text() : 'no result'
}

const TEMPLATE = {
  blocks: [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Feature was nerfed:*',
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: '*Type:*\nCollectible-model',
        },
        {
          type: 'mrkdwn',
          text: '*When:*\ntoday',
        },
        {
          type: 'mrkdwn',
          text: '*Moderator:*\nTrue.',
        },
        {
          type: 'mrkdwn',
          text: '*Moderator:*\nTrue.',
        },
      ],
    },
    {
      type: 'divider',
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: '*Type:*\nCollectible-model',
        },
        {
          type: 'mrkdwn',
          text: '*When:*\ntoday',
        },
      ],
    },
  ],
}
