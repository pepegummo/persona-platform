-- Launch checkpoint metrics (docs/ROADMAP.md). One query each. Run against the production DB
-- after 2–4 weeks. Tested in api/tests/test_moderation.py so they keep working as the schema evolves.

-- 1. Publish rate: personas published ÷ personas created
-- name: publish_rate
SELECT
    count(*) FILTER (WHERE published_version_id IS NOT NULL) AS published,
    count(*) AS created,
    round(
        count(*) FILTER (WHERE published_version_id IS NOT NULL)::numeric
        / NULLIF(count(*), 0), 3
    ) AS publish_rate
FROM personas;

-- 2. Share reach: unique visitors per published persona (share_link_opened events)
-- name: share_reach
SELECT
    p.id AS persona_id,
    p.slug,
    count(DISTINCT e.visitor_id) AS unique_visitors
FROM personas p
LEFT JOIN events e
    ON e.persona_id = p.id AND e.name = 'share_link_opened' AND e.visitor_id IS NOT NULL
WHERE p.published_version_id IS NOT NULL
GROUP BY p.id, p.slug
ORDER BY unique_visitors DESC;

-- 3. Engagement: share of visitor conversations with 3+ visitor messages
-- name: engagement
SELECT
    count(*) AS visitor_conversations,
    count(*) FILTER (WHERE user_messages >= 3) AS engaged,
    round(avg((user_messages >= 3)::int), 3) AS engaged_share
FROM (
    SELECT c.id, count(m.id) FILTER (WHERE m.role = 'user') AS user_messages
    FROM conversations c
    LEFT JOIN messages m ON m.conversation_id = c.id
    WHERE NOT c.is_owner_test
    GROUP BY c.id
) per_conversation;
