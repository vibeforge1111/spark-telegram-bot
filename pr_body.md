## Fix: add null check for ctx.from in callback handlers

Adds if (!ctx.from) return; guard before accessing ctx.from in spark_access callback.

See PR diff for details.