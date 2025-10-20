const Expense = require('../models/expense');
const Category = require('../models/category');
const moment = require('moment');
const { OpenAI } = require('openai');

// Environment configuration
require('dotenv').config();

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Controller for expense operations
const expenseController = {
  // Get all expenses
  async getAllExpenses(req, res) {
    try {
      const expenses = await Expense.getAll();
      res.json(expenses);
    } catch (error) {
      console.error('Error getting expenses:', error);
      res.status(500).json({ error: 'Failed to get expenses' });
    }
  },

  // Get expenses by month
  async getExpensesByMonth(req, res) {
    const { year, month } = req.params;
    try {
      const expenses = await Expense.getByMonth(year, month);
      const summary = await Expense.getMonthlySummary(year, month);
      
      // Calculate total for the month
      const totalAmount = summary.reduce((acc, item) => acc + parseFloat(item.total_amount), 0);
      
      res.json({
        expenses,
        summary,
        totalAmount
      });
    } catch (error) {
      console.error('Error getting expenses by month:', error);
      res.status(500).json({ error: 'Failed to get expenses for the specified month' });
    }
  },

  // Get a single expense
  async getExpense(req, res) {
    const { id } = req.params;
    try {
      const expense = await Expense.getById(id);
      if (!expense) {
        return res.status(404).json({ error: 'Expense not found' });
      }
      res.json(expense);
    } catch (error) {
      console.error('Error getting expense:', error);
      res.status(500).json({ error: 'Failed to get expense' });
    }
  },

  // Create a new expense
  async createExpense(req, res) {
    const { description, amount, category, expenseDate } = req.body;
    
    if (!description || !amount || !expenseDate) {
      return res.status(400).json({ error: 'Description, amount, and date are required' });
    }
    
    try {
      // Use current date if expenseDate is not provided
      const formattedDate = expenseDate || moment().format('YYYY-MM-DD');
      const newExpense = await Expense.create(description, amount, category, formattedDate);
      
      // If category is provided, increment its usage count
      if (category) {
        await Category.incrementUsage(category);
      }
      
      res.status(201).json(newExpense);
    } catch (error) {
      console.error('Error creating expense:', error);
      res.status(500).json({ error: 'Failed to create expense' });
    }
  },

  // Update an expense
  async updateExpense(req, res) {
    const { id } = req.params;
    const { description, amount, category, expenseDate } = req.body;
    
    try {
      const existingExpense = await Expense.getById(id);
      if (!existingExpense) {
        return res.status(404).json({ error: 'Expense not found' });
      }
      
      const updatedExpense = await Expense.update(
        id,
        description || existingExpense.description,
        amount || existingExpense.amount,
        category || existingExpense.category,
        expenseDate || existingExpense.expense_date
      );
      
      // If category is updated, increment its usage count
      if (category && category !== existingExpense.category) {
        await Category.incrementUsage(category);
      }
      
      res.json(updatedExpense);
    } catch (error) {
      console.error('Error updating expense:', error);
      res.status(500).json({ error: 'Failed to update expense' });
    }
  },

  // Delete an expense
  async deleteExpense(req, res) {
    const { id } = req.params;
    
    try {
      const deletedExpense = await Expense.delete(id);
      if (!deletedExpense) {
        return res.status(404).json({ error: 'Expense not found' });
      }
      res.json({ message: 'Expense deleted successfully', expense: deletedExpense });
    } catch (error) {
      console.error('Error deleting expense:', error);
      res.status(500).json({ error: 'Failed to delete expense' });
    }
  },

  // Get expense summary for a month
  async getMonthlySummary(req, res) {
    const { year, month } = req.params;
    
    try {
      const summary = await Expense.getMonthlySummary(year, month);
      const totalAmount = summary.reduce((acc, item) => acc + parseFloat(item.total_amount), 0);
      
      res.json({
        summary,
        totalAmount,
        month,
        year
      });
    } catch (error) {
      console.error('Error getting monthly summary:', error);
      res.status(500).json({ error: 'Failed to get monthly summary' });
    }
  },

  // Auto-categorize expenses using AI
  async categorizeBatch(req, res) {
    const { expenseIds } = req.body;
    
    if (!expenseIds || !Array.isArray(expenseIds) || expenseIds.length === 0) {
      return res.status(400).json({ error: 'Please provide valid expense IDs' });
    }
    
    try {
      const results = [];
      const existingCategories = await Category.getAll();
      const categoryNames = existingCategories.map(cat => cat.name);
      
      // Process each expense for categorization
      for (const id of expenseIds) {
        const expense = await Expense.getById(id);
        if (!expense) {
          results.push({ id, status: 'error', message: 'Expense not found' });
          continue;
        }
        
        try {
          // Call the AI service to predict category
          const categoryPrediction = await predictCategory(expense.description, categoryNames);
          
          if (categoryPrediction) {
            // Update the expense with the predicted category
            const updatedExpense = await Expense.update(
              id,
              expense.description,
              expense.amount,
              categoryPrediction,
              expense.expense_date
            );
            
            // Increment the usage count for the predicted category
            await Category.incrementUsage(categoryPrediction);
            
            results.push({
              id,
              status: 'success',
              previousCategory: expense.category || 'None',
              newCategory: categoryPrediction
            });
          } else {
            results.push({ id, status: 'error', message: 'Could not predict category' });
          }
        } catch (aiError) {
          console.error(`AI categorization error for expense ${id}:`, aiError);
          results.push({ id, status: 'error', message: 'AI service error' });
        }
      }
      
      res.json({ results });
    } catch (error) {
      console.error('Error in bulk categorization:', error);
      res.status(500).json({ error: 'Failed to categorize expenses' });
    }
  }
};

// Function to predict category using OpenAI API
async function predictCategory(description, existingCategories) {
  if (!process.env.OPENAI_API_KEY) {
    console.log('No OpenAI API key found, using simple categorization');
    return simpleKeywordCategorization(description, existingCategories);
  }
  
  try {
    console.log(`Attempting to categorize description: "${description}" with OpenAI`);
    
    const prompt = `Given the expense description "${description}", categorize it into one of the following categories: ${existingCategories.join(', ')}. 
    Consider the context and meaning of the expense. Respond with only the category name, nothing else.
    
    Example format:
    Description: "Groceries at Walmart"
    Response: Food
    
    Description: "${description}"
    Response:`;
    
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
      messages: [
        { 
          role: "system", 
          content: "You are a precise expense categorization assistant. Always respond with exactly one category name from the provided list, nothing more."
        },
        { 
          role: "user", 
          content: prompt 
        }
      ],
      temperature: 0.3, // Lower temperature for more consistent results
      max_tokens: 20    // We only need a short response
    });
    
    const predictedCategory = response.choices[0].message.content.trim();
    
    // Verify the predicted category is in our list (case-insensitive)
    const validCategory = existingCategories.find(
      category => category.toLowerCase() === predictedCategory.toLowerCase()
    );
    
    if (validCategory) {
      console.log(`Predicted category: ${validCategory}`);
      return validCategory;
    } else {
      console.log('OpenAI predicted invalid category, falling back to keyword-based categorization');
      return simpleKeywordCategorization(description, existingCategories);
    }
    
  } catch (error) {
    console.error('Error predicting category with OpenAI:', error);
    return simpleKeywordCategorization(description, existingCategories);
  }
}

// Simple keyword-based categorization as a fallback
function simpleKeywordCategorization(description, categories) {
  const text = description.toLowerCase();
  
  const keywordMap = {
    'food': ['grocery', 'restaurant', 'meal', 'lunch', 'dinner', 'breakfast', 'coffee', 'pizza', 'burger'],
    'transportation': ['gas', 'fuel', 'bus', 'train', 'taxi', 'uber', 'lyft', 'subway', 'car', 'vehicle', 'toll', 'parking'],
    'housing': ['rent', 'mortgage', 'apartment', 'home', 'house', 'property'],
    'utilities': ['electric', 'water', 'gas', 'internet', 'phone', 'bill', 'utility'],
    'entertainment': ['movie', 'game', 'concert', 'show', 'theater', 'netflix', 'spotify', 'subscription'],
    'healthcare': ['doctor', 'medical', 'health', 'medicine', 'dental', 'pharmacy', 'hospital', 'clinic'],
    'shopping': ['clothes', 'shoes', 'clothing', 'amazon', 'walmart', 'target', 'buy', 'purchase'],
    'education': ['tuition', 'book', 'school', 'college', 'university', 'course', 'class']
  };
  
  // Check each category for keyword matches
  for (const [category, keywords] of Object.entries(keywordMap)) {
    if (categories.includes(category) && keywords.some(keyword => text.includes(keyword))) {
      return category;
    }
  }
  
  // If no match, return the default category or the first category
  return categories.includes('Miscellaneous') ? 'Miscellaneous' : (categories[0] || 'Other');
}

module.exports = expenseController;