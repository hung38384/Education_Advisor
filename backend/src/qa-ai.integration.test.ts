import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createDatabase } from './config/database';
import { createDependencies, initServer } from './server';
import { AIClientError, QAInferenceClient } from './clients/ai.client';

function buildAuthHeader(token: string): { Authorization: string } {
    return { Authorization: `Bearer ${token}` };
}

async function registerAndLogin(app: ReturnType<typeof initServer>, email: string): Promise<string> {
    const registerRes = await request(app)
        .post('/api/auth/register')
        .send({
            email,
            password: '12345678',
            name: 'QA Tester',
        });

    assert.equal(registerRes.status, 201);

    const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
            email,
            password: '12345678',
        });

    assert.equal(loginRes.status, 200);
    const accessToken = loginRes.body.accessToken as string;
    assert.ok(accessToken);

    return accessToken;
}

test('qa ask uses AI answer when AI backend returns successfully', async (t) => {
    const db = createDatabase(':memory:');
    const fakeClient: QAInferenceClient = {
        askQuestion: async (input) => ({
            answer: `AI answer for: ${input.question}`,
            metadata: {
                provider: 'fake-ai',
                model: 'fake-model-v1',
            },
        }),
    };

    const dependencies = createDependencies(db, {
        qaInferenceClient: fakeClient,
    });
    const app = initServer(dependencies);

    t.after(() => {
        db.close();
    });

    const accessToken = await registerAndLogin(app, 'qa-ai-success@example.com');

    const askRes = await request(app)
        .post('/api/qa/ask')
        .set(buildAuthHeader(accessToken))
        .send({
            question: 'What scholarship paths should I prioritize?',
        });

    assert.equal(askRes.status, 200);
    assert.equal(
        askRes.body.answer,
        'AI answer for: What scholarship paths should I prioritize?'
    );
    assert.equal(askRes.body.assistantMessage.metadata.strategy, 'ai-service');
    assert.equal(askRes.body.assistantMessage.metadata.ai.provider, 'fake-ai');
});

test('qa ask falls back to template answer when AI backend fails', async (t) => {
    const db = createDatabase(':memory:');
    const failingClient: QAInferenceClient = {
        askQuestion: async () => {
            throw new AIClientError('Timed out', 504);
        },
    };

    const dependencies = createDependencies(db, {
        qaInferenceClient: failingClient,
    });
    const app = initServer(dependencies);

    t.after(() => {
        db.close();
    });

    const accessToken = await registerAndLogin(app, 'qa-ai-fallback@example.com');

    const askRes = await request(app)
        .post('/api/qa/ask')
        .set(buildAuthHeader(accessToken))
        .send({
            question: 'How can I improve my profile this semester?',
        });

    assert.equal(askRes.status, 200);
    assert.equal(askRes.body.assistantMessage.metadata.strategy, 'rule-based-fallback');
    assert.equal(askRes.body.assistantMessage.metadata.fallbackReason, 'timeout');
    assert.match(askRes.body.answer, /Mình đã nhận câu hỏi/);
});

test('qa ask trims long history messages before sending to AI backend', async (t) => {
    const db = createDatabase(':memory:');
    const capturedPayloads: Array<{ historyLengths: number[] }> = [];
    const fakeClient: QAInferenceClient = {
        askQuestion: async (input) => {
            const historyLengths = input.context.history.map((item) => item.message.length);
            capturedPayloads.push({ historyLengths });

            if (capturedPayloads.length === 1) {
                return {
                    answer: 'L'.repeat(5000),
                    metadata: { provider: 'fake-ai', model: 'fake-model-v1' },
                };
            }

            return {
                answer: 'Second answer after long history',
                metadata: { provider: 'fake-ai', model: 'fake-model-v1' },
            };
        },
    };

    const dependencies = createDependencies(db, {
        qaInferenceClient: fakeClient,
    });
    const app = initServer(dependencies);

    t.after(() => {
        db.close();
    });

    const accessToken = await registerAndLogin(app, 'qa-ai-history-trim@example.com');

    const firstAskRes = await request(app)
        .post('/api/qa/ask')
        .set(buildAuthHeader(accessToken))
        .send({
            question: 'First question to seed a very long answer',
        });

    assert.equal(firstAskRes.status, 200);
    assert.equal(firstAskRes.body.assistantMessage.metadata.strategy, 'ai-service');

    const secondAskRes = await request(app)
        .post('/api/qa/ask')
        .set(buildAuthHeader(accessToken))
        .send({
            question: 'Second question should still go through AI',
        });

    assert.equal(secondAskRes.status, 200);
    assert.equal(secondAskRes.body.assistantMessage.metadata.strategy, 'ai-service');

    assert.equal(capturedPayloads.length, 2);
    const secondPayloadHistoryLengths = capturedPayloads[1].historyLengths;
    assert.ok(secondPayloadHistoryLengths.length > 0);
    const maxHistoryMessageLength = Math.max(...secondPayloadHistoryLengths);
    assert.ok(maxHistoryMessageLength <= 3503);
});

test('qa supports create, message, and delete conversation flows', async (t) => {
    const db = createDatabase(':memory:');
    const fakeClient: QAInferenceClient = {
        askQuestion: async (input) => ({
            answer: `AI answer for conversation ${input.question}`,
            metadata: {
                provider: 'fake-ai',
                model: 'fake-model-v1',
            },
        }),
    };

    const dependencies = createDependencies(db, {
        qaInferenceClient: fakeClient,
    });
    const app = initServer(dependencies);

    t.after(() => {
        db.close();
    });

    const accessToken = await registerAndLogin(app, 'qa-conversation-flow@example.com');
    const authHeaders = buildAuthHeader(accessToken);

    const createRes = await request(app)
        .post('/api/qa/conversations')
        .set(authHeaders)
        .send({});

    assert.equal(createRes.status, 201);
    const createdConversationId = createRes.body.conversation.id as number;
    assert.ok(createdConversationId > 0);

    const listRes = await request(app)
        .get('/api/qa/conversations')
        .set(authHeaders);

    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listRes.body.conversations));
    assert.ok(listRes.body.conversations.some((item: { id: number }) => item.id === createdConversationId));

    const askRes = await request(app)
        .post('/api/qa/ask')
        .set(authHeaders)
        .send({
            question: 'Question inside a specific conversation',
            conversationId: createdConversationId,
        });

    assert.equal(askRes.status, 200);
    assert.equal(askRes.body.conversationId, createdConversationId);
    assert.equal(askRes.body.userMessage.conversationId, createdConversationId);
    assert.equal(askRes.body.assistantMessage.conversationId, createdConversationId);

    const messagesRes = await request(app)
        .get(`/api/qa/messages?conversationId=${createdConversationId}`)
        .set(authHeaders);

    assert.equal(messagesRes.status, 200);
    assert.equal(messagesRes.body.conversationId, createdConversationId);
    assert.ok(Array.isArray(messagesRes.body.messages));
    assert.equal(messagesRes.body.messages.length, 2);
    assert.ok(messagesRes.body.messages.every((item: { conversationId: number }) => item.conversationId === createdConversationId));

    const deleteRes = await request(app)
        .delete(`/api/qa/conversations/${createdConversationId}`)
        .set(authHeaders);

    assert.equal(deleteRes.status, 200);
    assert.equal(deleteRes.body.message, 'Conversation deleted successfully');

    const listAfterDeleteRes = await request(app)
        .get('/api/qa/conversations')
        .set(authHeaders);

    assert.equal(listAfterDeleteRes.status, 200);
    assert.ok(Array.isArray(listAfterDeleteRes.body.conversations));
    assert.ok(!listAfterDeleteRes.body.conversations.some((item: { id: number }) => item.id === createdConversationId));
});
