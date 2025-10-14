import pacote from 'pacote'
import graphviz from 'graphviz'
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
			.example([
				[
					'$0 --package express --output expressjs-graph',
					'Анализ expressjs и сохранение в expressjs-graph.png',
				],
				['$0 -p lodash -v 4.17.21 -a', 'Анализ lodash версии 4.17.21 с ASCII выводом'],
				[
					'$0 -p react -d 2 -f "babel"',
					'Анализ react с глубиной 2 и фильтром по "babel"',
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
	console.log('==============================')
}

class Node {
	constructor(
		public name: string,
		public version: string,
		public dependencies: Node[] = [],
	) {}
}

async function getDependencies(
	packageName: string,
	version: string = 'latest',
	maxDepth: number = 3,
	filter?: string,
): Promise<Node> {
	const cache = new Map<string, Node>()

	async function traverse(
		packageName: string,
		version: string = 'latest',
		depth: number = 0,
	): Promise<Node> {
		if (depth >= maxDepth) return new Node(packageName, version)

		const cacheKey = `${packageName}@${version}`

		if (cache.has(cacheKey)) return cache.get(cacheKey)!

		if (filter && packageName.includes(filter)) {
			console.log(`🔍 Пропущен пакет (фильтр): ${packageName}`)
			return new Node(packageName, version)
		}

		try {
			const manifest = await pacote.manifest(`${packageName}@${version}`)
			const node = new Node(packageName, manifest.version)

			cache.set(cacheKey, node)

			const dependencies = manifest.dependencies || {}

			node.dependencies = await Promise.all(
				Object.entries(dependencies).map(([name, version]) =>
					traverse(name, version, depth + 1),
				),
			)

			return node
		} catch (error) {
			console.error(`Ошибка для ${packageName}:`, error)
			return new Node(packageName, version)
		}
	}

	return traverse(packageName, version)
}

function generateGraph(node: Node): graphviz.Graph {
	const graph = graphviz.digraph('Dependencies')
	const visitedNodes = new Set<string>()

	function traverse(current: Node, parentNodeId: string | null = null) {
		const currentNodeId = `${current.name}\n${current.version}`

		graph.addNode(currentNodeId)
		visitedNodes.add(currentNodeId)

		const cacheKey = `${currentNodeId};${parentNodeId}`
		if (parentNodeId && !visitedNodes.has(cacheKey)) {
			graph.addEdge(parentNodeId, currentNodeId)
			visitedNodes.add(cacheKey)
		}

		current.dependencies.forEach(dependency => traverse(dependency, currentNodeId))
	}

	traverse(node)
	return graph
}

function saveGraph(graph: graphviz.Graph, fileName: string): void {
	if (!process.env.GraphVizPath) throw new Error('GraphVizPath not configured')

	graph.setGraphVizPath(process.env.GraphVizPath)
	graph.output('png', fileName)

	const fullPath = Path.resolve(process.cwd(), fileName)
	console.log('Граф сохранен по пути:', fullPath)
}

function printASCIITree(node: Node, prefix: string = '', isLast: boolean = true): void {
	const connector = isLast ? '└── ' : '├── '
	console.log(prefix + connector + node.name + '@' + node.version)

	const newPrefix = prefix + (isLast ? '    ' : '│   ')

	node.dependencies.forEach((dep, index) => {
		const isLastChild = index === node.dependencies.length - 1
		printASCIITree(dep, newPrefix, isLastChild)
	})
}

async function main() {
	try {
		console.log('🚀 Starting dependency analyzer...')

		const options = parseArgs()

		validateOptions(options)

		printOptions(options)

		console.log('🔍 Получаем зависимости...')
		const dependencyGraph = await getDependencies(
			options.package,
			options['package-version'],
			options.depth,
			options.filter,
		)

		if (options.ascii) {
			console.log('\n🌳 ASCII-дерево зависимостей:')
			printASCIITree(dependencyGraph)
		}

		console.log('\n📊 Генерируем граф...')
		const graph = generateGraph(dependencyGraph)

		saveGraph(graph, options.output)

		console.log('✅ Готово!')
	} catch (error) {
		console.error('💥 Error in main:', error)
	}
}

main()
