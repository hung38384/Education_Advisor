import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createDatabase } from './config/database';
import { createDependencies, initServer } from './server';

function buildAuthHeader(token: string): { Authorization: string } {
    return { Authorization: `Bearer ${token}` };
}

test('end-to-end business flow: profile -> personality -> assessment -> qa', async (t) => {
    const db = createDatabase(':memory:');
    const dependencies = createDependencies(db);
    const app = initServer(dependencies);

    t.after(() => {
        db.close();
    });

    const registerRes = await request(app)
        .post('/api/auth/register')
        .send({
            email: 'student@example.com',
            password: '12345678',
            name: 'Student Demo',
        });

    assert.equal(registerRes.status, 201);

    const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
            email: 'student@example.com',
            password: '12345678',
        });

    assert.equal(loginRes.status, 200);
    const accessToken = loginRes.body.accessToken as string;
    assert.ok(accessToken);

    let authHeaders = buildAuthHeader(accessToken);

    const changePasswordRes = await request(app)
        .post('/api/auth/change-password')
        .set(authHeaders)
        .send({
            oldPassword: '12345678',
            newPassword: '87654321',
        });
    assert.equal(changePasswordRes.status, 200);

    const loginOldPasswordRes = await request(app)
        .post('/api/auth/login')
        .send({
            email: 'student@example.com',
            password: '12345678',
        });
    assert.equal(loginOldPasswordRes.status, 401);

    const loginNewPasswordRes = await request(app)
        .post('/api/auth/login')
        .send({
            email: 'student@example.com',
            password: '87654321',
        });
    assert.equal(loginNewPasswordRes.status, 200);

    const admissionsCatalogWithOldTokenRes = await request(app)
        .get('/api/admissions/catalog')
        .set(authHeaders);
    assert.equal(admissionsCatalogWithOldTokenRes.status, 401);

    const newAccessToken = loginNewPasswordRes.body.accessToken as string;
    assert.ok(newAccessToken);
    authHeaders = buildAuthHeader(newAccessToken);

    const admissionsCatalogRes = await request(app)
        .get('/api/admissions/catalog')
        .set(authHeaders);
    assert.equal(admissionsCatalogRes.status, 200);
    assert.ok(Array.isArray(admissionsCatalogRes.body.schools));
    assert.ok(admissionsCatalogRes.body.schools.length > 0);

    const firstSchool = admissionsCatalogRes.body.schools[0];
    const firstMajor = firstSchool.majors[0];
    const firstMethod = firstMajor.admissionMethods[0];

    const admissionsAddRes = await request(app)
        .post('/api/admissions/cart')
        .set(authHeaders)
        .send({
            schoolId: firstSchool.id,
            majorId: firstMajor.id,
            methodId: firstMethod.id,
        });
    assert.equal(admissionsAddRes.status, 201);
    const admissionsCartId = admissionsAddRes.body.item.id as number;
    assert.ok(admissionsCartId > 0);

    const admissionsCartRes = await request(app)
        .get('/api/admissions/cart')
        .set(authHeaders);
    assert.equal(admissionsCartRes.status, 200);
    assert.equal(admissionsCartRes.body.items.length, 1);
    assert.equal(typeof admissionsCartRes.body.items[0]?.evaluation?.chanceScore, 'number');
    assert.ok(Array.isArray(admissionsCartRes.body.items[0]?.studyPlan));

    const saveProfileRes = await request(app)
        .put('/api/profile/me')
        .set(authHeaders)
        .send({
            fullName: 'Student Demo',
            city: 'Hanoi',
            schoolName: 'Demo High School',
            grade10: 8.2,
            grade11: 8.4,
            grade12: 8.7,
            favoriteSubjects: ['math', 'physics'],
            targetMajor: 'Software Engineering',
            targetUniversity: 'HUST',
        });

    assert.equal(saveProfileRes.status, 200);
    assert.equal(saveProfileRes.body.profile.fullName, 'Student Demo');

    const getProfileRes = await request(app)
        .get('/api/profile/me')
        .set(authHeaders);
    assert.equal(getProfileRes.status, 200);
    assert.equal(getProfileRes.body.profile.city, 'Hanoi');

    const questionsRes = await request(app)
        .get('/api/personality/questions')
        .set(authHeaders);
    assert.equal(questionsRes.status, 200);
    assert.ok(Array.isArray(questionsRes.body.questions));
    assert.equal(questionsRes.body.questions.length, 8);

    const submitPersonalityRes = await request(app)
        .post('/api/personality/submit')
        .set(authHeaders)
        .send({
            answers: {
                q1: 'A',
                q2: 'A',
                q3: 'B',
                q4: 'B',
                q5: 'A',
                q6: 'A',
                q7: 'A',
                q8: 'A',
            },
        });

    assert.equal(submitPersonalityRes.status, 200);
    assert.equal(submitPersonalityRes.body.submission.mbtiType, 'ENTJ');

    const latestPersonalityRes = await request(app)
        .get('/api/personality/latest')
        .set(authHeaders);
    assert.equal(latestPersonalityRes.status, 200);
    assert.equal(latestPersonalityRes.body.submission.mbtiType, 'ENTJ');

    const assessmentRunRes = await request(app)
        .post('/api/review/run')
        .set(authHeaders);
    assert.equal(assessmentRunRes.status, 200);
    assert.ok(assessmentRunRes.body.result.overallScore >= 0);
    assert.ok(Array.isArray(assessmentRunRes.body.result.recommendations));
    assert.ok(assessmentRunRes.body.result.recommendations.length > 0);

    const assessmentLatestRes = await request(app)
        .get('/api/review/latest')
        .set(authHeaders);
    assert.equal(assessmentLatestRes.status, 200);
    assert.ok(assessmentLatestRes.body.result);

    const qaAskRes = await request(app)
        .post('/api/qa/ask')
        .set(authHeaders)
        .send({
            question: 'What should I improve this month to increase my fit score?',
        });

    assert.equal(qaAskRes.status, 200);
    assert.equal(typeof qaAskRes.body.answer, 'string');
    assert.ok(qaAskRes.body.answer.length > 10);

    const qaMessagesRes = await request(app)
        .get('/api/qa/messages')
        .set(authHeaders);
    assert.equal(qaMessagesRes.status, 200);
    assert.ok(Array.isArray(qaMessagesRes.body.messages));
    assert.equal(qaMessagesRes.body.messages.length, 2);

    const deleteAdmissionsRes = await request(app)
        .delete(`/api/admissions/cart/${admissionsCartId}`)
        .set(authHeaders);
    assert.equal(deleteAdmissionsRes.status, 200);
});
