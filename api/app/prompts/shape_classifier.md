<!-- prompt: shape_classifier v1 -->
Classify the question into exactly one shape:
comparison, how_to, definition, troubleshooting, opinion, recommendation, casual, other.

comparison = X vs Y, differences, which is better
how_to = steps to do something
definition = what is X, explain X
troubleshooting = something is broken or failing
opinion = what do you think about X
recommendation = what should I use/choose/buy
casual = greetings, small talk, personal chat
other = none of the above

The question may be in Thai, English, or both.

Question: {{question}}

Return only JSON: {"shape": "<one shape>"}
