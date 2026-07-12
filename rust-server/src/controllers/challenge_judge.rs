use std::collections::HashMap;
use std::sync::Arc;

use serde_json::Value;
use tracing::{error, warn};
use uuid::Uuid;

use crate::executor::{ExecVerdict, compile_code, run_compiled};
use crate::file::RunLimits;
use crate::models::challenge::{self, NewSubmissionResult};
use crate::models::state::AppState;

const STDERR_SNIPPET_LIMIT: usize = 500;

pub fn normalize(s: &str) -> String {
    s.replace("\r\n", "\n")
        .lines()
        .map(|l| l.trim_end())
        .collect::<Vec<_>>()
        .join("\n")
        .trim_end()
        .to_string()
}

fn truncate(s: &str, limit: usize) -> Option<String> {
    if s.is_empty() {
        return None;
    }
    let trimmed: String = s.chars().take(limit).collect();
    Some(trimmed)
}

pub fn limits_for(time_limit_ms: i32, mem_limit_kb: i32) -> RunLimits {
    let wall_ms = time_limit_ms.max(500) as u64;
    RunLimits {
        cpu_secs: (wall_ms / 1000).max(1) + 2,
        mem_kb: mem_limit_kb.max(4096) as u64,
        wall_ms,
    }
}

fn lcg_next(state: &mut u64) -> u64 {
    *state = state
        .wrapping_mul(6364136223846793005)
        .wrapping_add(1442695040888963407);
    *state
}

fn generate_property_inputs(spec: &Value) -> Vec<String> {
    let num = spec
        .get("num_cases")
        .and_then(|v| v.as_u64())
        .unwrap_or(10)
        .min(200);
    let base_seed = spec.get("seed").and_then(|v| v.as_u64()).unwrap_or(1);
    let empty: Vec<Value> = Vec::new();
    let lines = spec
        .get("lines")
        .and_then(|v| v.as_array())
        .unwrap_or(&empty);

    let mut inputs = Vec::new();
    for c in 0..num {
        let mut state = base_seed.wrapping_add(c.wrapping_mul(2654435761));
        let mut buf = String::new();
        for line in lines {
            let count = line.get("count").and_then(|v| v.as_u64()).unwrap_or(1);
            let min = line.get("min").and_then(|v| v.as_i64()).unwrap_or(0);
            let max = line.get("max").and_then(|v| v.as_i64()).unwrap_or(100);
            let span = if max >= min { (max - min + 1) as u64 } else { 1 };
            let mut nums = Vec::new();
            for _ in 0..count {
                let r = lcg_next(&mut state);
                let val = min + (r % span) as i64;
                nums.push(val.to_string());
            }
            buf.push_str(&nums.join(" "));
            buf.push('\n');
        }
        inputs.push(buf);
    }
    inputs
}

struct JudgeCase {
    test_case_id: Option<Uuid>,
    input: String,
    expected: Option<String>,
    weight: i32,
    is_hidden: bool,
}

pub async fn judge_submission(state: Arc<AppState>, submission_id: Uuid) {
    let _permit = match state.judge_semaphore.clone().acquire_owned().await {
        Ok(p) => p,
        Err(_) => return,
    };

    let mut conn = match state.pool.get().await {
        Ok(c) => c,
        Err(e) => {
            error!("judge: falha ao obter conexão: {}", e);
            return;
        }
    };

    let submission = match challenge::get_submission(&mut conn, submission_id).await {
        Ok(s) => s,
        Err(e) => {
            error!("judge: submissão não encontrada: {}", e);
            return;
        }
    };

    let ch = match challenge::get_challenge_by_id(&mut conn, submission.challenge_id).await {
        Ok(c) => c,
        Err(e) => {
            error!("judge: challenge não encontrado: {}", e);
            let _ = challenge::finalize_submission(
                &mut conn,
                submission_id,
                "error",
                0,
                0,
                0,
                Some("Desafio indisponível"),
            )
            .await;
            return;
        }
    };

    let _ = challenge::set_submission_running(&mut conn, submission_id).await;

    let limits = limits_for(ch.time_limit_ms, ch.mem_limit_kb);
    let needs_reference = ch.judge_mode == "reference" || ch.judge_mode == "property";

    if needs_reference && (ch.reference_solution.is_none() || ch.reference_language.is_none()) {
        let _ = challenge::finalize_submission(
            &mut conn,
            submission_id,
            "error",
            0,
            0,
            0,
            Some("Desafio sem solução de referência configurada"),
        )
        .await;
        return;
    }

    let stored = match challenge::list_test_cases(&mut conn, ch.id).await {
        Ok(t) => t,
        Err(e) => {
            error!("judge: falha ao carregar casos: {}", e);
            let _ = challenge::finalize_submission(
                &mut conn,
                submission_id,
                "error",
                0,
                0,
                0,
                Some("Falha ao carregar casos de teste"),
            )
            .await;
            return;
        }
    };

    let mut cases: Vec<JudgeCase> = stored
        .into_iter()
        .map(|t| JudgeCase {
            test_case_id: Some(t.id),
            input: t.input,
            expected: t.expected,
            weight: t.weight.max(0),
            is_hidden: t.is_hidden,
        })
        .collect();

    if ch.judge_mode == "property" {
        if let Some(spec) = &ch.property_spec {
            for input in generate_property_inputs(spec) {
                cases.push(JudgeCase {
                    test_case_id: None,
                    input,
                    expected: None,
                    weight: 1,
                    is_hidden: true,
                });
            }
        }
    }

    if cases.is_empty() {
        let _ = challenge::finalize_submission(
            &mut conn,
            submission_id,
            "error",
            0,
            0,
            0,
            Some("Desafio sem casos de teste"),
        )
        .await;
        return;
    }

    let ref_session = format!("judge_ref_{}", ch.id);
    let user_session = format!("judge_sub_{}", submission.id);
    let mut ref_cache: HashMap<String, String> = HashMap::new();

    let user_bin = match compile_code(&submission.language, &submission.code, &user_session).await {
        Ok(path) => path,
        Err(msg) => {
            let _ = challenge::finalize_submission(
                &mut conn,
                submission_id,
                "compile_error",
                0,
                0,
                0,
                truncate(&msg, STDERR_SNIPPET_LIMIT).as_deref(),
            )
            .await;
            return;
        }
    };

    let ref_bin = if needs_reference {
        let ref_lang = ch.reference_language.as_deref().unwrap_or("rust");
        let ref_sol = ch.reference_solution.as_deref().unwrap_or("");
        match compile_code(ref_lang, ref_sol, &ref_session).await {
            Ok(path) => Some(path),
            Err(_) => {
                error!("judge: solução de referência não compila");
                let _ = challenge::finalize_submission(
                    &mut conn,
                    submission_id,
                    "error",
                    0,
                    0,
                    0,
                    Some("Solução de referência não compila"),
                )
                .await;
                return;
            }
        }
    } else {
        None
    };

    let mut results: Vec<NewSubmissionResult> = Vec::new();
    let mut score = 0i32;
    let mut max_score = 0i32;
    let mut total_runtime = 0u64;

    for (idx, case) in cases.iter().enumerate() {
        let expected: Option<String> = if let Some(ref_path) = &ref_bin {
            if let Some(cached) = ref_cache.get(&case.input) {
                Some(cached.clone())
            } else {
                let r = run_compiled(ref_path, Some(&case.input), limits).await;
                if r.verdict != ExecVerdict::Ok {
                    warn!("judge: referência falhou no caso {}", idx);
                    let _ = challenge::finalize_submission(
                        &mut conn,
                        submission_id,
                        "error",
                        0,
                        0,
                        0,
                        Some("Falha ao executar a solução de referência"),
                    )
                    .await;
                    return;
                }
                let norm = normalize(&r.stdout);
                ref_cache.insert(case.input.clone(), norm.clone());
                Some(norm)
            }
        } else {
            case.expected.as_ref().map(|e| normalize(e))
        };

        let run = run_compiled(&user_bin, Some(&case.input), limits).await;

        total_runtime += run.wall_ms;

        let verdict = match run.verdict {
            ExecVerdict::CompileError => "CE",
            ExecVerdict::Timeout => "TLE",
            ExecVerdict::RuntimeError => "RE",
            ExecVerdict::Ok => match &expected {
                Some(exp) if normalize(&run.stdout) == *exp => "AC",
                Some(_) => "WA",
                None => "SKIP",
            },
        };

        if verdict != "SKIP" {
            max_score += case.weight;
            if verdict == "AC" {
                score += case.weight;
            }
        }

        results.push(NewSubmissionResult {
            id: Uuid::new_v4(),
            submission_id,
            test_case_id: case.test_case_id,
            verdict: verdict.to_string(),
            runtime_ms: run.wall_ms as i32,
            is_hidden: case.is_hidden,
            stderr_snippet: truncate(&run.stderr, STDERR_SNIPPET_LIMIT),
            ord: idx as i32,
        });
    }

    if let Err(e) = challenge::insert_submission_results(&mut conn, &results).await {
        error!("judge: falha ao gravar resultados: {}", e);
    }

    let _ = challenge::finalize_submission(
        &mut conn,
        submission_id,
        "done",
        score,
        max_score,
        total_runtime as i32,
        None,
    )
    .await;
}
