/**
 * Server-Sent Events (SSE) endpoint for streaming agent thinking in real-time
 * GET /api/agent/stream/:sessionId
 */

import prisma from '../../../utils/prisma'

export default defineEventHandler(async (event) => {
  const sessionId = getRouterParam(event, 'sessionId')

  if (!sessionId) {
    throw createError({
      statusCode: 400,
      message: 'Session ID required',
    })
  }

  // Set SSE headers
  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable nginx buffering
  })

  // Send initial comment to establish connection
  event.node.res.write(': connected\n\n')

  // Track last sent thinking step index
  let lastIndex = 0
  let isComplete = false
  let intervalId: NodeJS.Timeout

  // Poll database for updates every 500ms
  intervalId = setInterval(async () => {
    try {
      const session = await prisma.agentSession.findUnique({
        where: { id: sessionId },
        select: {
          thinking: true,
          status: true,
          venueData: true,
          eventData: true,
          completenessScore: true,
          errorMessage: true,
        },
      })

      if (!session) {
        clearInterval(intervalId)
        event.node.res.write(`data: ${JSON.stringify({ type: 'error', message: 'Session not found' })}\n\n`)
        event.node.res.end()
        return
      }

      const thinking = (session.thinking as any[]) || []

      // Send new thinking steps
      if (thinking.length > lastIndex) {
        const newSteps = thinking.slice(lastIndex)
        for (const step of newSteps) {
          event.node.res.write(`data: ${JSON.stringify(step)}\n\n`)
        }
        lastIndex = thinking.length

        // Also send current data state after thinking updates
        event.node.res.write(`data: ${JSON.stringify({
          type: 'data_update',
          venueData: session.venueData,
          eventData: session.eventData,
          completenessScore: session.completenessScore,
        })}\n\n`)
      }

      // Check if session is complete
      if (session.status !== 'IN_PROGRESS' && !isComplete) {
        isComplete = true
        event.node.res.write(`data: ${JSON.stringify({
          type: 'complete',
          status: session.status,
          venueData: session.venueData,
          eventData: session.eventData,
          completenessScore: session.completenessScore,
          errorMessage: session.errorMessage,
        })}\n\n`)
        clearInterval(intervalId)
        event.node.res.end()
      }
    } catch (error) {
      console.error('SSE error:', error)
      clearInterval(intervalId)
      event.node.res.write(`data: ${JSON.stringify({ type: 'error', message: 'Internal error' })}\n\n`)
      event.node.res.end()
    }
  }, 500)

  // Clean up on connection close
  event.node.req.on('close', () => {
    clearInterval(intervalId)
  })

  // Prevent the event handler from automatically ending the response
  return new Promise(() => {
    // This promise never resolves, keeping the connection open
  })
})
