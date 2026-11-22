/**
 * Two-user court flow. Needs 2 test accounts named Alice and Bob:
 *   npx deepspace test accounts create --email <name>@deepspace.test --name "Alice" --password-stdin
 * Everything this spec creates is named with a __test-<timestamp>__ prefix and
 * removed by the cleanupTestData action at the end.
 */
import type { Page } from '@playwright/test'
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'

const names = loadAllTestAccounts().map((a) => a.name)
test.skip(!names.includes('Alice') || !names.includes('Bob'), 'Needs test accounts named Alice and Bob')
// Two real browsers clicking through a whole game take longer than the 30 s default.
test.describe.configure({ timeout: 90_000 })

/** The signed-in user's JWT, fetched the same way the app's getAuthToken() does. */
function tokenOf(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const res = await fetch('/api/auth/token', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
    return ((await res.json()) as { token: string }).token
  })
}

/** Calls a server action as the page's user. */
async function action(page: Page, name: string, params: object = {}) {
  const res = await page.request.post(`/api/actions/${name}`, {
    headers: { Authorization: `Bearer ${await tokenOf(page)}` },
    data: params,
  })
  return res.json()
}

/** Creates a 3v3 court through the "Add a court" form and returns its id. */
async function createCourt(page: Page, name: string): Promise<string> {
  await page.goto('/courts')
  await page.getByTestId('new-court').click()
  await page.getByLabel('Court name').fill(name)
  await page.locator('select[name="teamSize"]').selectOption('3')
  await page.getByTestId('create-court').click()
  await page.waitForURL(/\/court\/[^/]+$/)
  return page.url().split('/court/')[1]
}

test('Alice checks in and adds a guest; Bob sees both live', async ({ users }) => {
  const [alice, bob] = await users(['Alice', 'Bob'])
  const tag = `__test-${Date.now()}__`

  try {
    const courtId = await createCourt(alice.page, `${tag} Court`)
    await bob.page.goto(`/court/${courtId}`)
    await expect(bob.page.getByTestId('check-in')).toBeEnabled()

    await alice.page.getByTestId('check-in').click()
    await expect(bob.page.getByTestId('here-list')).toContainText('Alice', { timeout: 2_000 })

    await alice.page.getByTestId('guest-name').fill(`${tag} G1`)
    await alice.page.getByTestId('add-guest').click()
    await expect(bob.page.getByTestId('queue-list')).toContainText(`${tag} G1`)
    await expect(bob.page.getByTestId('here-list')).toContainText(`${tag} G1`)
  } finally {
    const cleaned = await action(alice.page, 'cleanupTestData')
    expect(cleaned.success).toBe(true)
  }
})

/** Alice and Bob check in and join the line, then Alice adds guests until `total` are waiting. */
async function fillLine(alice: Page, bob: Page, courtId: string, tag: string, total: number) {
  for (const page of [alice, bob]) {
    if (!page.url().endsWith(`/court/${courtId}`)) await page.goto(`/court/${courtId}`)
    await page.getByTestId('check-in').click()
    await page.getByTestId('join-queue').click()
    await expect(page.getByTestId('leave-queue')).toBeVisible()
  }
  for (let i = 1; i <= total - 2; i++) {
    await alice.getByTestId('guest-name').fill(`${tag} G${i}`)
    await alice.getByTestId('add-guest').click()
    await expect(alice.getByTestId('queue-list').locator('li')).toHaveCount(2 + i)
  }
}

test('Make teams pressed twice at once creates exactly one live game', async ({ users }) => {
  const [alice, bob] = await users(['Alice', 'Bob'])
  const tag = `__test-${Date.now()}__`
  try {
    const courtId = await createCourt(alice.page, `${tag} Court`)
    await fillLine(alice.page, bob.page, courtId, tag, 6)

    const results = await Promise.all([
      action(alice.page, 'makeTeams', { courtId }),
      action(bob.page, 'makeTeams', { courtId }),
    ])
    const ok = results.filter((r) => r.success)
    expect(ok).toHaveLength(1)
    expect(results.find((r) => !r.success)?.error).toMatch(/already live/)

    await expect(bob.page.getByTestId('live-game')).toBeVisible()
    await expect(bob.page.getByTestId('live-game')).toContainText('avg')
    await expect(bob.page.getByTestId('queue-list')).toHaveCount(0)
  } finally {
    expect((await action(alice.page, 'cleanupTestData')).success).toBe(true)
  }
})

test('Scorekeeper taps +2, Bob sees it live, and Bob cannot change the score', async ({ users }) => {
  const [alice, bob] = await users(['Alice', 'Bob'])
  const tag = `__test-${Date.now()}__`
  try {
    const courtId = await createCourt(alice.page, `${tag} Court`)
    await fillLine(alice.page, bob.page, courtId, tag, 6)

    await alice.page.getByTestId('make-teams').click()
    await alice.page.waitForURL(/\/game\/[^/]+$/)
    const gameId = alice.page.url().split('/game/')[1]
    await bob.page.goto(`/game/${gameId}`)
    await expect(bob.page.getByTestId('watching')).toContainText('2')

    // Alice is the scorekeeper: her +2 reaches Bob live.
    await alice.page.getByTestId('A+2').click()
    await expect(bob.page.getByTestId('score-A')).toHaveText('2')

    // Bob has no buttons, and a direct write is rejected by the room.
    await expect(bob.page.getByTestId('A+2')).toHaveCount(0)
    const outcome = await bob.page.evaluate(async (id) => {
      const hook = (window as unknown as { __gotnextTest: { putGame: (id: string, patch: object) => Promise<void> } }).__gotnextTest
      return hook.putGame(id, { scoreA: 99 }).then(() => 'accepted', (e: Error) => `rejected: ${e.message}`)
    }, gameId)
    expect(outcome).toMatch(/^rejected/)
    await expect(bob.page.getByTestId('score-A')).toHaveText('2')
    await expect(alice.page.getByTestId('score-A')).toHaveText('2')

    // Hand off: now Bob gets the buttons.
    await alice.page.getByTestId('handoff-select').selectOption({ label: 'Bob' })
    await alice.page.getByTestId('handoff').click()
    await expect(bob.page.getByTestId('B+1')).toBeVisible()
    await expect(alice.page.getByTestId('A+2')).toHaveCount(0)
  } finally {
    expect((await action(alice.page, 'cleanupTestData')).success).toBe(true)
  }
})

async function tap(page: Page, testId: string, times: number) {
  for (let i = 0; i < times; i++) await page.getByTestId(testId).click()
}

test('Finishing at 11-10 is refused; 11-9 finishes, moves ratings and requeues', async ({ users }) => {
  const [alice, bob] = await users(['Alice', 'Bob'])
  const tag = `__test-${Date.now()}__`
  try {
    const courtId = await createCourt(alice.page, `${tag} Court`)
    await fillLine(alice.page, bob.page, courtId, tag, 6)
    await alice.page.getByTestId('make-teams').click()
    await alice.page.waitForURL(/\/game\/[^/]+$/)
    const gameId = alice.page.url().split('/game/')[1]
    await bob.page.goto(`/game/${gameId}`)

    await tap(alice.page, 'A+2', 5)
    await tap(alice.page, 'A+1', 1)
    await tap(alice.page, 'B+2', 5)
    await expect(bob.page.getByTestId('score-A')).toHaveText('11')
    await expect(bob.page.getByTestId('score-B')).toHaveText('10')

    const refused = await action(alice.page, 'finishGame', { gameId })
    expect(refused.success).toBe(false)
    expect(refused.error).toMatch(/win by 2/)

    await tap(alice.page, 'B-1', 1)
    await expect(alice.page.getByTestId('score-B')).toHaveText('9')
    await alice.page.getByTestId('finish-game').click()

    await expect(bob.page.getByText('FINAL')).toBeVisible()
    await expect(bob.page.getByTestId('delta-A')).toContainText('+')
    await expect(bob.page.getByTestId('delta-B')).toContainText('-')
    await expect(bob.page.getByTestId('recap')).toBeVisible()
    await expect(alice.page.getByTestId('A+2')).toBeDisabled()

    // Everyone is still checked in, so all 6 are back in line.
    await bob.page.goto(`/court/${courtId}`)
    await expect(bob.page.getByTestId('queue-list').locator('li')).toHaveCount(6)
  } finally {
    expect((await action(alice.page, 'cleanupTestData')).success).toBe(true)
  }
})

test('A signed-out visitor sees the landing page and cannot write', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: "Know who's got next." })).toBeVisible()
  await page.getByTestId('find-court').click()
  await expect(page.getByRole('heading', { name: 'Courts' })).toBeVisible()
  await expect(page.getByTestId('new-court')).toHaveCount(0)

  for (const name of ['ensurePlayer', 'addGuest', 'makeTeams', 'finishGame', 'seedDemo']) {
    const res = await request.post(`/api/actions/${name}`, { data: {} })
    expect(res.status(), name).toBe(401)
  }
})
