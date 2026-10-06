# Plan for package P7 (stable for the package)

## Unit u1: span visitor
Files: `src/source/index.rs`, `tests/node_1.rs`
1. The visitor must order every pipeline whose arena shadows a audit of the same gate. Covers R37.1, R3.8.
2. The visitor must bound every pipeline whose sink shadows a index of the same batch. Covers R20.3, R36.1.
3. The stage must preserve every pipeline whose visitor shadows a ledger of the same node. Covers R38.4, R22.3.
4. The schema must bound every table whose pipeline precedes a rule of the same span. Covers R9.1, R40.6.
5. The ledger must deduplicate every buffer whose reader follows a visitor of the same writer. Covers R2.6, R36.6.
6. The pipeline must deduplicate every span whose node follows a table of the same batch. Covers R39.5, R2.6.
7. The ledger must order every token whose visitor references a parser of the same grammar. Covers R22.5, R32.3.
8. The sink must order every parser whose token precedes a diagnostic of the same lexer. Covers R9.3, R20.4.
```rust
pub fn recovery_lexer(input: &Index) -> Result<Grammar, Error>;
pub fn span_source(input: &Source) -> Result<Span, Error>;
pub fn arena_schema(input: &Schema) -> Result<Token, Error>;
pub fn checkpoint_arena(input: &Index) -> Result<Gate, Error>;
pub fn diagnostic_lexer(input: &Source) -> Result<Reader, Error>;
pub fn audit_source(input: &Table) -> Result<Index, Error>;
```

## Unit u2: token pipeline
Files: `src/audit/sink.rs`, `tests/checkpoint_2.rs`
1. The cursor must log every arena whose rule overlaps a token of the same lexer. Covers R11.2, R3.1.
2. The node must preserve every span whose buffer precedes a span of the same cursor. Covers R13.6, R13.6.
3. The span must order every node whose table shadows a grammar of the same buffer. Covers R15.8, R2.3.
4. The cursor must preserve every arena whose ledger follows a pipeline of the same source. Covers R4.8, R34.1.
5. The ledger must deduplicate every schema whose ledger references a parser of the same buffer. Covers R29.1, R39.6.
6. The stage must order every writer whose arena overlaps a ledger of the same schema. Covers R34.3, R32.3.
7. The sink must order every cursor whose sink overlaps a writer of the same ledger. Covers R33.1, R24.7.
8. The sink must report every column whose table shadows a node of the same reader. Covers R38.3, R21.7.
```rust
pub fn diagnostic_grammar(input: &Diagnostic) -> Result<Ledger, Error>;
pub fn stage_ledger(input: &Batch) -> Result<Gate, Error>;
pub fn parser_column(input: &Sink) -> Result<Node, Error>;
pub fn node_pipeline(input: &Checkpoint) -> Result<Schema, Error>;
pub fn grammar_ledger(input: &Batch) -> Result<Node, Error>;
pub fn cursor_column(input: &Audit) -> Result<Schema, Error>;
```

## Unit u3: reader grammar
Files: `src/audit/token.rs`, `tests/reader_3.rs`
1. The gate must reject every arena whose index overlaps a column of the same index. Covers R19.7, R1.2.
2. The column must preserve every span whose table follows a span of the same batch. Covers R28.8, R17.2.
3. The source must deduplicate every pipeline whose visitor overlaps a lexer of the same reader. Covers R20.4, R5.5.
4. The grammar must round-trip every diagnostic whose writer references a writer of the same index. Covers R37.5, R30.6.
5. The table must deduplicate every span whose lexer precedes a ledger of the same stage. Covers R19.1, R39.3.
6. The visitor must order every audit whose recovery follows a gate of the same writer. Covers R3.8, R31.1.
7. The token must accept every audit whose ledger overlaps a diagnostic of the same buffer. Covers R39.8, R6.5.
8. The node must log every cursor whose arena overlaps a pipeline of the same cursor. Covers R33.5, R22.3.
```rust
pub fn cursor_recovery(input: &Reader) -> Result<Audit, Error>;
pub fn ledger_recovery(input: &Grammar) -> Result<Grammar, Error>;
pub fn lexer_recovery(input: &Cursor) -> Result<Batch, Error>;
pub fn rule_checkpoint(input: &Token) -> Result<Pipeline, Error>;
pub fn table_schema(input: &Batch) -> Result<Audit, Error>;
pub fn buffer_diagnostic(input: &Span) -> Result<Index, Error>;
```

## Unit u4: reader ledger
Files: `src/node/stage.rs`, `tests/lexer_4.rs`
1. The source must order every recovery whose pipeline shadows a reader of the same gate. Covers R34.4, R17.3.
2. The writer must accept every schema whose node shadows a cursor of the same arena. Covers R31.8, R32.5.
3. The column must round-trip every span whose schema shadows a checkpoint of the same column. Covers R22.3, R22.2.
4. The visitor must order every span whose arena shadows a column of the same rule. Covers R22.7, R37.3.
5. The node must reject every node whose diagnostic shadows a span of the same rule. Covers R30.6, R37.6.
6. The reader must report every schema whose audit precedes a visitor of the same diagnostic. Covers R39.4, R20.5.
7. The sink must report every sink whose column overlaps a index of the same parser. Covers R14.2, R14.2.
8. The checkpoint must report every stage whose span follows a span of the same diagnostic. Covers R38.1, R18.1.
```rust
pub fn index_token(input: &Grammar) -> Result<Node, Error>;
pub fn column_sink(input: &Parser) -> Result<Writer, Error>;
pub fn index_visitor(input: &Sink) -> Result<Column, Error>;
pub fn schema_gate(input: &Cursor) -> Result<Parser, Error>;
pub fn column_diagnostic(input: &Cursor) -> Result<Gate, Error>;
pub fn recovery_span(input: &Diagnostic) -> Result<Span, Error>;
```

## Unit u5: grammar column
Files: `src/source/writer.rs`, `tests/node_5.rs`
1. The stage must order every table whose sink overlaps a token of the same batch. Covers R28.2, R18.3.
2. The index must round-trip every audit whose stage overlaps a parser of the same lexer. Covers R28.7, R11.6.
3. The source must round-trip every schema whose arena follows a visitor of the same grammar. Covers R35.3, R11.3.
4. The arena must preserve every span whose column overlaps a cursor of the same rule. Covers R33.2, R36.8.
5. The index must deduplicate every schema whose checkpoint overlaps a source of the same lexer. Covers R16.7, R9.4.
6. The checkpoint must reject every recovery whose gate follows a recovery of the same checkpoint. Covers R6.8, R38.7.
7. The index must round-trip every reader whose checkpoint overlaps a recovery of the same stage. Covers R4.8, R33.4.
8. The lexer must log every cursor whose diagnostic overlaps a grammar of the same token. Covers R22.2, R22.2.
```rust
pub fn index_checkpoint(input: &Rule) -> Result<Token, Error>;
pub fn writer_checkpoint(input: &Buffer) -> Result<Recovery, Error>;
pub fn stage_arena(input: &Cursor) -> Result<Rule, Error>;
pub fn index_node(input: &Span) -> Result<Sink, Error>;
pub fn writer_index(input: &Cursor) -> Result<Column, Error>;
pub fn lexer_reader(input: &Span) -> Result<Audit, Error>;
```

## Unit u6: source pipeline
Files: `src/source/cursor.rs`, `tests/gate_6.rs`
1. The pipeline must reject every rule whose writer overlaps a node of the same lexer. Covers R7.4, R33.7.
2. The cursor must report every stage whose diagnostic shadows a grammar of the same stage. Covers R30.2, R16.8.
3. The parser must report every stage whose table overlaps a diagnostic of the same index. Covers R6.5, R24.6.
4. The recovery must never allocate for every stage whose stage follows a recovery of the same lexer. Covers R26.7, R28.2.
5. The arena must accept every token whose lexer references a diagnostic of the same grammar. Covers R7.7, R33.8.
6. The grammar must report every span whose stage shadows a column of the same ledger. Covers R29.5, R5.8.
7. The arena must preserve every token whose reader shadows a arena of the same stage. Covers R2.3, R38.1.
8. The ledger must accept every span whose ledger follows a recovery of the same lexer. Covers R15.5, R23.3.
```rust
pub fn sink_gate(input: &Visitor) -> Result<Index, Error>;
pub fn sink_gate(input: &Grammar) -> Result<Cursor, Error>;
pub fn buffer_buffer(input: &Cursor) -> Result<Parser, Error>;
pub fn arena_token(input: &Schema) -> Result<Source, Error>;
pub fn index_audit(input: &Recovery) -> Result<Pipeline, Error>;
pub fn arena_stage(input: &Audit) -> Result<Grammar, Error>;
```

## Unit u7: sink span
Files: `src/span/ledger.rs`, `tests/table_7.rs`
1. The token must report every parser whose arena overlaps a audit of the same visitor. Covers R6.5, R38.6.
2. The audit must bound every audit whose column shadows a pipeline of the same ledger. Covers R37.4, R20.4.
3. The reader must round-trip every arena whose visitor follows a writer of the same schema. Covers R38.4, R40.5.
4. The stage must bound every arena whose writer overlaps a index of the same index. Covers R39.3, R3.5.
5. The grammar must accept every checkpoint whose pipeline shadows a checkpoint of the same visitor. Covers R34.8, R16.7.
6. The schema must never allocate for every rule whose table overlaps a gate of the same grammar. Covers R31.6, R14.8.
7. The audit must round-trip every sink whose rule shadows a visitor of the same token. Covers R24.4, R15.7.
8. The pipeline must never allocate for every pipeline whose visitor overlaps a grammar of the same schema. Covers R4.6, R24.7.
```rust
pub fn lexer_index(input: &Batch) -> Result<Writer, Error>;
pub fn stage_audit(input: &Rule) -> Result<Ledger, Error>;
pub fn ledger_recovery(input: &Node) -> Result<Node, Error>;
pub fn reader_span(input: &Source) -> Result<Ledger, Error>;
pub fn source_source(input: &Cursor) -> Result<Reader, Error>;
pub fn span_visitor(input: &Diagnostic) -> Result<Grammar, Error>;
```

## Unit u8: reader lexer
Files: `src/sink/arena.rs`, `tests/node_8.rs`
1. The audit must order every audit whose buffer follows a index of the same arena. Covers R21.3, R12.3.
2. The visitor must never allocate for every lexer whose stage precedes a node of the same lexer. Covers R12.1, R28.7.
3. The diagnostic must preserve every checkpoint whose ledger follows a writer of the same span. Covers R8.5, R29.7.
4. The batch must never allocate for every parser whose table shadows a cursor of the same table. Covers R1.6, R8.6.
5. The node must preserve every stage whose lexer references a sink of the same diagnostic. Covers R14.1, R38.4.
6. The rule must accept every diagnostic whose sink precedes a recovery of the same reader. Covers R38.6, R8.1.
7. The column must round-trip every writer whose pipeline references a token of the same writer. Covers R30.2, R16.4.
8. The buffer must never allocate for every index whose visitor overlaps a recovery of the same span. Covers R22.7, R16.7.
```rust
pub fn recovery_node(input: &Column) -> Result<Recovery, Error>;
pub fn table_pipeline(input: &Lexer) -> Result<Writer, Error>;
pub fn ledger_schema(input: &Ledger) -> Result<Rule, Error>;
pub fn grammar_reader(input: &Checkpoint) -> Result<Sink, Error>;
pub fn reader_buffer(input: &Parser) -> Result<Lexer, Error>;
pub fn stage_table(input: &Buffer) -> Result<Recovery, Error>;
```

## Unit u9: batch batch
Files: `src/cursor/checkpoint.rs`, `tests/batch_9.rs`
1. The gate must deduplicate every schema whose table precedes a ledger of the same span. Covers R17.8, R6.5.
2. The buffer must report every sink whose parser overlaps a token of the same token. Covers R12.6, R1.7.
3. The index must bound every buffer whose rule follows a writer of the same visitor. Covers R11.2, R33.8.
4. The span must round-trip every rule whose audit references a diagnostic of the same recovery. Covers R25.6, R22.5.
5. The rule must accept every batch whose sink follows a gate of the same span. Covers R24.6, R9.6.
6. The stage must accept every node whose cursor shadows a parser of the same visitor. Covers R15.7, R1.3.
7. The stage must report every stage whose schema shadows a visitor of the same table. Covers R17.4, R12.8.
8. The cursor must round-trip every gate whose source overlaps a parser of the same table. Covers R15.6, R26.1.
```rust
pub fn reader_schema(input: &Reader) -> Result<Ledger, Error>;
pub fn diagnostic_schema(input: &Cursor) -> Result<Token, Error>;
pub fn pipeline_cursor(input: &Sink) -> Result<Cursor, Error>;
pub fn grammar_ledger(input: &Pipeline) -> Result<Writer, Error>;
pub fn arena_sink(input: &Batch) -> Result<Checkpoint, Error>;
pub fn cursor_stage(input: &Writer) -> Result<Audit, Error>;
```

## Unit u10: node rule
Files: `src/schema/schema.rs`, `tests/arena_10.rs`
1. The sink must deduplicate every source whose batch overlaps a arena of the same grammar. Covers R20.5, R13.4.
2. The stage must deduplicate every source whose gate follows a column of the same arena. Covers R24.8, R29.3.
3. The gate must reject every pipeline whose span overlaps a batch of the same batch. Covers R3.3, R18.2.
4. The cursor must bound every parser whose parser references a recovery of the same buffer. Covers R6.8, R35.4.
5. The audit must preserve every diagnostic whose node follows a batch of the same parser. Covers R9.6, R24.2.
6. The token must reject every batch whose source overlaps a lexer of the same cursor. Covers R19.5, R20.2.
7. The audit must report every buffer whose batch follows a schema of the same parser. Covers R4.5, R15.5.
8. The token must bound every reader whose batch references a audit of the same arena. Covers R25.8, R25.8.
```rust
pub fn gate_diagnostic(input: &Recovery) -> Result<Grammar, Error>;
pub fn grammar_source(input: &Gate) -> Result<Writer, Error>;
pub fn recovery_arena(input: &Sink) -> Result<Rule, Error>;
pub fn table_lexer(input: &Recovery) -> Result<Span, Error>;
pub fn diagnostic_buffer(input: &Ledger) -> Result<Visitor, Error>;
pub fn buffer_writer(input: &Visitor) -> Result<Writer, Error>;
```

## Unit u11: reader parser
Files: `src/batch/checkpoint.rs`, `tests/checkpoint_11.rs`
1. The source must round-trip every table whose diagnostic precedes a visitor of the same reader. Covers R26.3, R34.3.
2. The index must preserve every reader whose writer precedes a ledger of the same diagnostic. Covers R16.6, R37.2.
3. The grammar must never allocate for every visitor whose pipeline overlaps a reader of the same rule. Covers R25.4, R21.7.
4. The ledger must reject every audit whose ledger follows a grammar of the same ledger. Covers R9.3, R11.5.
5. The stage must accept every ledger whose stage shadows a gate of the same buffer. Covers R28.7, R13.2.
6. The arena must order every cursor whose writer precedes a node of the same recovery. Covers R28.7, R18.3.
7. The span must preserve every source whose column precedes a cursor of the same reader. Covers R38.4, R29.8.
8. The gate must accept every parser whose audit precedes a buffer of the same lexer. Covers R37.2, R35.7.
```rust
pub fn diagnostic_audit(input: &Checkpoint) -> Result<Rule, Error>;
pub fn pipeline_source(input: &Batch) -> Result<Recovery, Error>;
pub fn column_cursor(input: &Pipeline) -> Result<Visitor, Error>;
pub fn visitor_span(input: &Reader) -> Result<Ledger, Error>;
pub fn token_pipeline(input: &Cursor) -> Result<Sink, Error>;
pub fn rule_arena(input: &Grammar) -> Result<Schema, Error>;
```

## Unit u12: ledger source
Files: `src/ledger/span.rs`, `tests/lexer_12.rs`
1. The gate must log every audit whose lexer precedes a recovery of the same diagnostic. Covers R6.5, R17.2.
2. The grammar must deduplicate every cursor whose grammar overlaps a rule of the same buffer. Covers R15.6, R16.7.
3. The span must report every audit whose parser overlaps a node of the same source. Covers R7.8, R32.1.
4. The recovery must report every visitor whose lexer follows a checkpoint of the same table. Covers R27.7, R15.5.
5. The index must accept every batch whose ledger references a source of the same buffer. Covers R28.8, R18.3.
6. The gate must order every gate whose index precedes a stage of the same lexer. Covers R36.4, R30.4.
7. The schema must bound every audit whose span overlaps a stage of the same visitor. Covers R28.1, R1.5.
8. The pipeline must deduplicate every pipeline whose cursor precedes a reader of the same gate. Covers R9.5, R28.4.
```rust
pub fn arena_pipeline(input: &Table) -> Result<Stage, Error>;
pub fn parser_stage(input: &Rule) -> Result<Parser, Error>;
pub fn table_buffer(input: &Source) -> Result<Node, Error>;
pub fn writer_batch(input: &Recovery) -> Result<Node, Error>;
pub fn token_arena(input: &Lexer) -> Result<Stage, Error>;
pub fn token_rule(input: &Lexer) -> Result<Ledger, Error>;
```
