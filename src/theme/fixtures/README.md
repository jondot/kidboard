Real `colors.toml` files from Omarchy (MIT, © David Heinemeier Hansson),
copied verbatim as test fixtures.

They are here to keep one promise honest: *any* Omarchy theme is a Kidboard
theme as data. `palette.test.ts` parses every file in this folder and asserts
that each one produces a complete, legible palette. If the parser ever stops
handling a real file — or the tone mapping ever produces text a child cannot
read — these fail.

Do not edit them. Fixing a fixture would be fixing the wrong thing.
