import { EventPayloads, WebhookEvent } from '@octokit/webhooks';
import fetch from 'node-fetch';
import { Context, Probot } from 'probot';

const jiraRegex = /VULN-[0-9]+/g;

const processPR = async (context: WebhookEvent<EventPayloads.WebhookPayloadPullRequest> & Omit<Context<any>, keyof WebhookEvent<any>>) => {
    const missingJiraIDs = new Set<string>();
    const jiraIds = new Set<string>();

    const response = await fetch(context.payload.pull_request.commits_url);
    const data = await response.json();
    data.forEach((element: { commit: { message: string }; sha: string }) => {
        const match = element.commit.message.match(jiraRegex);
        if (match === null) {
            missingJiraIDs.add(element.sha);
        } else {
            match.forEach((jiraId) => {
                jiraIds.add(jiraId);
            });
        }
    });
    let responseBody = '';
    if (missingJiraIDs.size > 0) {
        responseBody = responseBody + 'Commits missing Jira IDs:\n';
        missingJiraIDs.forEach((commit) => {
            responseBody = responseBody + commit + '\n';
        });
    }
    if (jiraIds.size > 0) {
        responseBody = responseBody + 'Referenced Jiras:\n';
        jiraIds.forEach((jiraId) => {
            responseBody = responseBody + 'https://issues.redhat.com/browse/' + jiraId + '\n';
        });
    }
    const comment = context.issue({ body: responseBody });
    await context.octokit.issues.createComment(comment);
};

export = (app: Probot) => {
    app.on('issues.opened', async (context) => {
        const issueComment = context.issue({
            body: 'Thanks for opening this issue!',
        });
        await context.octokit.issues.createComment(issueComment);
    });
    app.on('pull_request.synchronize', async (context) => processPR(context));
    app.on('pull_request.opened', async (context) => processPR(context));
};
