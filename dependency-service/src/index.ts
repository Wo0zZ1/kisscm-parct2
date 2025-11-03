import dotenv from 'dotenv'
import Path from 'path'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

dotenv.config()

interface CLIOptions {
	package: string
	'package-version': string
	output: string
	ascii: boolean
	depth: number
	filter?: string
	'test-repo'?: string
	reverse?: boolean
}

function parseArgs(): CLIOptions {
	try {
		const argv = yargs(hideBin(process.argv))
			.option('package', {
				alias: 'p',
				type: 'string',
				description: 'Имя анализируемого пакета',
				demandOption: true,
			})
			.option('package-version', {
				alias: 'pv',
				type: 'string',
				description: 'Версия пакета',
				default: 'latest',
			})
			.option('output', {
				alias: 'o',
				type: 'string',
				description: 'Имя сгенерированного файла с изображением графа',
				default: 'dependencies.png',
			})
			.option('ascii', {
				alias: 'a',
				type: 'boolean',
				description: 'Режим вывода зависимостей в формате ASCII-дерева',
				default: false,
			})
			.option('depth', {
				alias: 'd',
				type: 'number',
				description: 'Максимальная глубина анализа зависимостей',
				default: Infinity,
			})
			.option('filter', {
				alias: 'f',
				type: 'string',
				description: 'Подстрока для фильтрации пакетов',
			})
			.option('test-repo', {
				alias: 't',
				type: 'string',
				description: 'Путь к файлу тестового репозитория (JSON)',
			})
			.option('reverse', {
				alias: 'r',
				type: 'boolean',
				description: 'Режим обратных зависимостей (кто зависит от пакета)',
				default: false,
			})
			.example([
				[
					'$0 --package serde --output serde-graph',
					'Анализ Rust-пакета serde и сохранение в serde-graph.png',
				],
				['$0 -p tokio -pv 1.35.0 -a', 'Анализ tokio версии 1.35.0 с ASCII выводом'],
				[
					'$0 -p actix-web -d 2 -f "test"',
					'Анализ actix-web с глубиной 2 и фильтром по "test"',
				],
				[
					'$0 -p A -t test-repo.json -a',
					'Анализ тестового графа из файла test-repo.json',
				],
			])
			.help()
			.alias('help', 'h')
			.parseSync()

		return argv as CLIOptions
	} catch (error) {
		console.error('❌ Error parsing arguments:', error)
		process.exit(1)
	}
}

function validateOptions(options: CLIOptions): void {
	if (!options.package || options.package.trim() === '')
		throw new Error('Имя пакета не может быть пустым')

	if (options.depth < 1)
		throw new Error('Глубина анализа должна быть положительным числом')
}

function printOptions(options: CLIOptions): void {
	console.log('=== Настроенные параметры ===')
	console.log(`Пакет: ${options.package}`)
	console.log(`Версия: ${options['package-version']}`)
	console.log(`Выходной файл: ${options.output}`)
	console.log(`ASCII-дерево: ${options.ascii ? 'включено' : 'выключено'}`)
	console.log(`Макс. глубина: ${options.depth}`)
	console.log(`Фильтр: ${options.filter || 'не задан'}`)
	console.log(`Тестовый репозиторий: ${options['test-repo'] || 'не используется'}`)
	console.log(`Обратные зависимости: ${options.reverse ? 'включено' : 'выключено'}`)
	console.log('==============================')
}

interface DependencyNode {
	name: string
	version: string
	depth: number
	dependencies: DependencyNode[]
}

// Интерфейс для тестового репозитория
interface TestRepository {
	packages: {
		[name: string]: {
			version: string
			dependencies: {
				[name: string]: string
			}
		}
	}
}

// Функция для загрузки тестового репозитория из JSON-файла
async function loadTestRepository(filePath: string): Promise<TestRepository> {
	const fs = await import('fs/promises')
	const fileContent = await fs.readFile(filePath, 'utf-8')
	return JSON.parse(fileContent) as TestRepository
}

// Функция для получения зависимостей из тестового репозитория
function getTestManifest(
	repo: TestRepository,
	packageName: string,
): Record<string, string> {
	const pkg = repo.packages[packageName]
	if (!pkg) {
		console.error(`Пакет ${packageName} не найден в тестовом репозитории`)
		return {}
	}
	return pkg.dependencies || {}
}

// Функция для получения зависимостей из crates.io
async function getCargoManifest(
	crateName: string,
	version: string = 'latest',
): Promise<Record<string, string>> {
	try {
		// Очищаем версию от префиксов Cargo (^, ~, =, >=)
		let cleanVersion = version
		if (version !== 'latest') cleanVersion = version.replace(/^[^0-9]+/, '')

		// Получаем информацию о крейте для определения актуальной версии
		const crateUrl = `https://crates.io/api/v1/crates/${crateName}`
		console.log(crateUrl)

		const crateResponse = await fetch(crateUrl, {
			headers: {
				'User-Agent': 'dependency-analyzer (educational project)',
			},
		})

		if (!crateResponse.ok) {
			console.error(`Ошибка загрузки ${crateName}: HTTP ${crateResponse.status}`)
			return {}
		}

		const crateData = await crateResponse.json()

		// Определяем версию для загрузки
		const targetVersion =
			cleanVersion === 'latest' ? crateData.crate.max_stable_version : cleanVersion

		if (!targetVersion) {
			console.error(`Версия не найдена для ${crateName}`)
			return {}
		}

		// Загружаем зависимости для конкретной версии
		const depsUrl = `https://crates.io/api/v1/crates/${crateName}/${targetVersion}/dependencies`
		const depsResponse = await fetch(depsUrl, {
			headers: {
				'User-Agent': 'dependency-analyzer (educational project)',
			},
		})

		if (!depsResponse.ok) {
			console.error(
				`Ошибка загрузки зависимостей ${crateName}@${targetVersion}: HTTP ${depsResponse.status}`,
			)
			return {}
		}

		const depsData = await depsResponse.json()
		const deps = (depsData.dependencies || []) as Array<{
			crate_id: string
			req: string
			kind: string
			optional: boolean
		}>

		const dependencies: Record<string, string> = {}
		for (const dep of deps) {
			// Учитываем только обычные зависимости, игнорируя dev
			if (dep.kind === 'normal' && !dep.optional) dependencies[dep.crate_id] = dep.req
		}

		return dependencies
	} catch (error) {
		console.error(`Ошибка при получении манифеста для ${crateName}:`, error)
		return {}
	}
}

// Функция для получения зависимостей через BFS
async function getDependenciesBFS(
	packageName: string,
	version: string = 'latest',
	maxDepth: number = Infinity,
	filter?: string,
	testRepo?: TestRepository,
): Promise<DependencyNode> {
	const cache = new Map<string, DependencyNode>()
	const queue: { name: string; version: string; depth: number }[] = []
	const filteredPackages = new Set<string>() // Для отслеживания уже отфильтрованных пакетов

	const root: DependencyNode = {
		name: packageName,
		version: version,
		depth: 0,
		dependencies: [],
	}

	cache.set(`${packageName}@${version}`, root)
	queue.push({ name: packageName, version, depth: 0 })

	while (queue.length > 0) {
		const current = queue.shift()!

		if (current.depth >= maxDepth) continue

		try {
			// Выбираем источник данных: тестовый репозиторий или Cargo API
			const dependencies = testRepo
				? getTestManifest(testRepo, current.name)
				: await getCargoManifest(current.name, current.version)

			const currentNode = cache.get(`${current.name}@${current.version}`)!

			for (const [depName, depVersion] of Object.entries(dependencies)) {
				// Не учитывать пакеты, имя которых содержит заданную подстроку
				if (filter && depName.includes(filter)) {
					if (!filteredPackages.has(depName)) {
						console.log(`🔍 Пропущен пакет (фильтр): ${depName}`)
						filteredPackages.add(depName)
					}
					continue
				}

				const cacheKey = `${depName}@${depVersion}`

				if (cache.has(cacheKey)) {
					// Обнаружена циклическая зависимость или повторное использование
					console.log(
						`🔄 Обнаружен цикл или повторное использование: ${depName}@${depVersion}`,
					)
					const existingNode = cache.get(cacheKey)!
					currentNode.dependencies.push(existingNode)
					continue
				}

				const depNode: DependencyNode = {
					name: depName,
					version: depVersion as string,
					depth: current.depth + 1,
					dependencies: [],
				}

				cache.set(cacheKey, depNode)
				currentNode.dependencies.push(depNode)

				if (current.depth + 1 < maxDepth) {
					queue.push({
						name: depName,
						version: depVersion as string,
						depth: current.depth + 1,
					})
				}
			}
		} catch (error) {
			console.error(`Ошибка для ${current.name}:`, error)
		}
	}

	return root
}

// Функция для получения обратных зависимостей
async function getReverseDependenciesBFS(
	targetPackage: string,
	maxDepth: number = Infinity,
	testRepo: TestRepository,
): Promise<string[]> {
	const reverseDeps: string[] = []
	const queue: { name: string; version: string; depth: number }[] = []
	const visited = new Set<string>()

	// Очередь для проверки
	for (const [pkgName, pkgData] of Object.entries(testRepo.packages))
		queue.push({ name: pkgName, version: pkgData.version, depth: 0 })

	while (queue.length > 0) {
		const current = queue.shift()!
		const key = `${current.name}@${current.version}`

		if (visited.has(key) || current.depth >= maxDepth) continue
		visited.add(key)

		const dependencies = getTestManifest(testRepo, current.name)

		if (dependencies[targetPackage])
			reverseDeps.push(`${current.name}@${current.version}`)
	}

	return reverseDeps
}

// Функция текстовой генерации D2-диаграммы
function generateD2Diagram(node: DependencyNode): string {
	const lines: string[] = []
	const visitedNodes = new Set<string>()
	const visitedEdges = new Set<string>()

	function sanitizeId(name: string): string {
		return name.replace(/[^a-zA-Z0-9_]/g, '_')
	}

	function traverse(current: DependencyNode, parentId: string | null = null) {
		const nodeId = sanitizeId(current.name)
		const nodeLabel = `${current.name}\\n${current.version}`

		if (!visitedNodes.has(nodeId)) {
			lines.push(`${nodeId}: "${nodeLabel}"`)
			visitedNodes.add(nodeId)
		}

		if (parentId) {
			const edgeKey = `${parentId}->${nodeId}`
			if (!visitedEdges.has(edgeKey)) {
				lines.push(`${parentId} -> ${nodeId}`)
				visitedEdges.add(edgeKey)
			}
		}

		// Прекращаем обход только если все зависимости уже обработаны
		const processedKey = `${nodeId}-processed`
		if (visitedNodes.has(processedKey)) return

		visitedNodes.add(processedKey)
		current.dependencies.forEach(dep => traverse(dep, nodeId))
	}

	traverse(node)
	return lines.join('\n')
}

// Функция сохранения D2-диаграммы
async function saveD2Graph(d2Content: string, fileName: string): Promise<void> {
	const fs = await import('fs/promises')
	const { exec } = await import('child_process')
	const { promisify } = await import('util')
	const execAsync = promisify(exec)

	const d2FileName = fileName.replace(/\.png$/, '.d2')
	await fs.writeFile(d2FileName, d2Content, 'utf-8')
	console.log(`D2-файл сохранен: ${Path.resolve(process.cwd(), d2FileName)}`)

	const d2Path = process.env.D2Path
	if (!d2Path) throw new Error('D2Path is not defined in .env file')

	try {
		await execAsync(`"${d2Path}" "${d2FileName}" "${fileName}"`)
		console.log(`Граф сохранен: ${Path.resolve(process.cwd(), fileName)}`)
	} catch (error) {
		console.error('❌ Ошибка генерации PNG. Проверьте путь D2Path в .env файле')
		console.log(`Текущий путь D2: ${d2Path}`)
		if (error instanceof Error) console.error(`Детали ошибки: ${error.message}`)
	}
}

// Функция печати ASCII-дерева зависимостей
function printASCIITreeFromDependencyNode(
	node: DependencyNode,
	prefix: string = '',
	isLast: boolean = true,
	visited: Set<string> = new Set(),
): void {
	const connector = isLast ? '└── ' : '├── '
	const nodeId = `${node.name}@${node.version}`
	console.log(prefix + connector + nodeId)

	if (visited.has(nodeId)) return
	visited.add(nodeId)

	const newPrefix = prefix + (isLast ? '    ' : '│   ')

	node.dependencies.forEach((dep, index) => {
		const isLastChild = index === node.dependencies.length - 1
		printASCIITreeFromDependencyNode(dep, newPrefix, isLastChild, visited)
	})
}

async function main() {
	try {
		console.log('🚀 Starting dependency analyzer...')

		const options = parseArgs()

		validateOptions(options)

		printOptions(options)

		// Загружаем тестовый репозиторий, если указан
		let testRepo: TestRepository | undefined
		if (options['test-repo']) {
			console.log(`📁 Загружаем тестовый репозиторий: ${options['test-repo']}`)
			testRepo = await loadTestRepository(options['test-repo'])
			console.log(`✅ Загружено пакетов: ${Object.keys(testRepo.packages).length}`)
		}

		// Режим обратных зависимостей
		if (options.reverse) {
			console.log('🔄 Режим обратных зависимостей...')
			const reverseDeps = await getReverseDependenciesBFS(
				options.package,
				options.depth,
				testRepo!,
			)
			console.log(`\n📦 Пакеты, зависящие от ${options.package}:`)
			if (reverseDeps.length === 0) console.log('  (нет зависимостей)')
			else reverseDeps.forEach(dep => console.log(`  - ${dep}`))

			console.log('✅ Готово!')
			return
		}

		console.log('🔍 Получаем зависимости...')
		const dependencyGraph = await getDependenciesBFS(
			options.package,
			options['package-version'],
			options.depth,
			options.filter,
			testRepo,
		)

		if (options.ascii) {
			console.log('\n🌳 ASCII-дерево зависимостей:')
			printASCIITreeFromDependencyNode(dependencyGraph)
		}

		console.log('\n📊 Генерация D2-диаграммы...')
		const d2Content = generateD2Diagram(dependencyGraph)
		await saveD2Graph(d2Content, options.output)

		console.log('✅ Готово!')
	} catch (error) {
		console.error('💥 Ошибка:', error)
	}
}

main()
