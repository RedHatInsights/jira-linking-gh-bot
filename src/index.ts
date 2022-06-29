import { EventPayloads, WebhookEvent } from '@octokit/webhooks';
import fetch from 'node-fetch';
import { Context, Probot } from 'probot';

const jiraRegex = process.env.JIRA_REGEXP || /(VULN|SPM|VMAAS|VULN4OS)-[0-9]+/g;

const checkComments = async (commentsUrl: string): Promise<number | undefined> => {
    const response = await fetch(commentsUrl);
    const data = await response.json();
    for (const comment of data.slice().reverse()) {
        if (comment.user.id === 88086763) {
            return comment.id;
        }
    }
    return undefined;
};

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

    const commentId = await checkComments(context.payload.pull_request.comments_url);
    if (commentId !== undefined) {
        await context.octokit.issues.updateComment({
            body: responseBody,
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            comment_id: commentId,
        });
        console.log('updated comment at: ', context.payload.pull_request.html_url);
    } else {
        const comment = context.issue({ body: responseBody });
        await context.octokit.issues.createComment(comment);
        console.log('created comment at: ', context.payload.pull_request.html_url);
    }
};

export = (app: Probot) => {
    app.on('pull_request.opened', async (context) => processPR(context));
    app.on('pull_request.synchronize', async (context) => processPR(context));
};
